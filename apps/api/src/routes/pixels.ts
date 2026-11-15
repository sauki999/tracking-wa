import { and, asc, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { db, schema } from "../db";
import { type AppEnv, requireUser } from "../lib/context";
import { decrypt, encrypt } from "../lib/crypto";
import { validateScope } from "../lib/scope";
import { v } from "../lib/validator";
import { capiLogger } from "../services/capi-log";
import {
  buildTestEvent,
  MetaError,
  metaErrorMessage,
  sendEvents,
  sha256,
  TEST_AD_NEEDS_PAGE,
  validatePixel,
} from "../services/meta";

const P = schema.pixels;
const PW = schema.pixelWaAccounts;

const body = z.object({
  name: z.string().trim().min(1).max(80),
  pixelId: z.string().trim().regex(/^\d{5,20}$/, "Pixel ID harus angka"),
  accessToken: z.string().trim().min(20).optional(),
  wabaId: z.string().trim().regex(/^\d*$/).optional(),
  pageId: z.string().trim().regex(/^\d*$/).optional(),
  testEventCode: z.string().trim().max(40).optional(),
  applyAll: z.boolean(),
  waAccountIds: z.array(z.uuid()).default([]),
});

const mask = (t: string) => `••••${t.slice(-6)}`;

/** Validasi ke Meta: token & akses dataset, plus kirim event uji bila ada test code */
async function checkWithMeta(
  userId: string,
  pixelRowId: string | null,
  pixelId: string,
  token: string,
  testEventCode?: string | null,
) {
  try {
    const info = await validatePixel(pixelId, token, capiLogger({ userId, source: "validate", pixelId: pixelRowId }));
    let testEvent: string | null = null;
    if (testEventCode) {
      const r = await sendEvents(
        pixelId,
        token,
        [
          {
            event_name: "Lead",
            event_time: Math.floor(Date.now() / 1000),
            event_id: `ctwa-test-${Date.now()}`,
            action_source: "chat",
            user_data: { ph: [sha256("6280000000000")] },
          },
        ],
        testEventCode,
        capiLogger({ userId, source: "test", pixelId: pixelRowId }),
      );
      testEvent = `Event uji terkirim (${r.events_received ?? 0} diterima). Cek di Events Manager → Test Events.`;
    }
    return { name: info.name ?? null, testEvent };
  } catch (e) {
    const msg = e instanceof MetaError ? e.message : (e as Error).message;
    throw new HTTPException(400, { message: `Validasi Meta gagal: ${msg}` });
  }
}

async function ownedPixel(userId: string, id: string) {
  const [p] = await db.select().from(P).where(and(eq(P.id, id), eq(P.userId, userId)));
  if (!p) throw new HTTPException(404, { message: "Pixel tidak ditemukan" });
  return p;
}

async function saveLinks(pixelId: string, applyAll: boolean, waAccountIds: string[]) {
  await db.delete(PW).where(eq(PW.pixelId, pixelId));
  if (!applyAll && waAccountIds.length) {
    await db.insert(PW).values([...new Set(waAccountIds)].map((waAccountId) => ({ pixelId, waAccountId })));
  }
}

const scopeOpts = { table: P, link: PW, linkOwner: PW.pixelId, label: "Pixel" };

export const pixelRoutes = new Hono<AppEnv>()
  .use(requireUser)
  .get("/", async (c) => {
    const user = c.get("user")!;
    const pixels = await db.select().from(P).where(eq(P.userId, user.id)).orderBy(asc(P.createdAt));
    const links = pixels.length
      ? await db.select().from(PW).where(inArray(PW.pixelId, pixels.map((p) => p.id)))
      : [];
    return c.json(
      pixels.map(({ accessTokenEnc, ...p }) => ({
        ...p,
        accessTokenMasked: mask(decrypt(accessTokenEnc)),
        waAccountIds: links.filter((l) => l.pixelId === p.id).map((l) => l.waAccountId),
      })),
    );
  })

  .post("/", v("json", body), async (c) => {
    const user = c.get("user")!;
    const b = c.req.valid("json");
    if (!b.accessToken) throw new HTTPException(400, { message: "Access token CAPI wajib diisi" });
    await validateScope({ userId: user.id, applyAll: b.applyAll, waAccountIds: b.waAccountIds, ...scopeOpts });
    const meta = await checkWithMeta(user.id, null, b.pixelId, b.accessToken, b.testEventCode);
    const [p] = await db
      .insert(P)
      .values({
        userId: user.id,
        name: b.name,
        pixelId: b.pixelId,
        accessTokenEnc: encrypt(b.accessToken),
        wabaId: b.wabaId || null,
        pageId: b.pageId || null,
        testEventCode: b.testEventCode || null,
        applyAll: b.applyAll,
        validatedAt: new Date(),
      })
      .returning({ id: P.id });
    await saveLinks(p.id, b.applyAll, b.waAccountIds);
    return c.json({ id: p.id, ...meta }, 201);
  })

  .put("/:id", v("param", z.object({ id: z.uuid() })), v("json", body), async (c) => {
    const user = c.get("user")!;
    const { id } = c.req.valid("param");
    const b = c.req.valid("json");
    const existing = await ownedPixel(user.id, id);
    await validateScope({ userId: user.id, selfId: id, applyAll: b.applyAll, waAccountIds: b.waAccountIds, ...scopeOpts });
    const token = b.accessToken ?? decrypt(existing.accessTokenEnc);
    const meta = await checkWithMeta(user.id, id, b.pixelId, token, b.testEventCode);
    await db
      .update(P)
      .set({
        name: b.name,
        pixelId: b.pixelId,
        accessTokenEnc: b.accessToken ? encrypt(b.accessToken) : existing.accessTokenEnc,
        wabaId: b.wabaId || null,
        pageId: b.pageId || null,
        testEventCode: b.testEventCode || null,
        applyAll: b.applyAll,
        validatedAt: new Date(),
      })
      .where(eq(P.id, id));
    await saveLinks(id, b.applyAll, b.waAccountIds);
    return c.json({ id, ...meta });
  })

  // Tombol Test: kirim satu event uji ke Meta dan kembalikan balasannya apa adanya
  .post(
    "/:id/test",
    v("param", z.object({ id: z.uuid() })),
    v(
      "json",
      z.object({
        kind: z.enum(["ad", "organic"]),
        eventName: z.string().trim().min(1).max(50).regex(/^[A-Za-z0-9_ ]+$/, "Nama event hanya huruf, angka, spasi, _"),
        testEventCode: z.string().trim().max(40).optional(),
      }),
    ),
    async (c) => {
      const user = c.get("user")!;
      const { id } = c.req.valid("param");
      const b = c.req.valid("json");
      const pixel = await ownedPixel(user.id, id);
      if (b.kind === "ad" && !pixel.pageId) throw new HTTPException(400, { message: TEST_AD_NEEDS_PAGE });

      const event = buildTestEvent(b.kind, b.eventName, pixel);
      const testEventCode = b.testEventCode || null;
      try {
        const res = await sendEvents(
          pixel.pixelId,
          decrypt(pixel.accessTokenEnc),
          [event],
          testEventCode,
          capiLogger({ userId: user.id, source: "test", pixelId: pixel.id }),
        );
        return c.json({
          ok: true as const,
          eventsReceived: res.events_received ?? 0,
          messages: res.messages ?? [],
          fbtraceId: res.fbtrace_id ?? null,
          testEventCode,
          request: { data: [event], ...(testEventCode ? { test_event_code: testEventCode } : {}) },
        });
      } catch (e) {
        const err = e instanceof MetaError ? e : new MetaError((e as Error).message, 0, null);
        return c.json({
          ok: false as const,
          message: metaErrorMessage(err.body, err.message) ?? err.message,
          httpStatus: err.status,
          fbtraceId: err.fbtraceId ?? null,
          response: err.body,
          testEventCode,
          request: { data: [event], ...(testEventCode ? { test_event_code: testEventCode } : {}) },
        });
      }
    },
  )

  .delete("/:id", v("param", z.object({ id: z.uuid() })), async (c) => {
    const user = c.get("user")!;
    const { id } = c.req.valid("param");
    await ownedPixel(user.id, id);
    await db.delete(P).where(eq(P.id, id));
    return c.json({ ok: true });
  });
