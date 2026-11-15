import { and, asc, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { db, schema } from "../db";
import { type AppEnv, requireUser } from "../lib/context";
import { validateScope } from "../lib/scope";
import { v } from "../lib/validator";

const T = schema.triggers;
const TW = schema.triggerWaAccounts;
const K = schema.triggerKeywords;

const body = z
  .object({
    name: z.string().trim().min(1).max(80),
    applyAll: z.boolean(),
    waAccountIds: z.array(z.uuid()).default([]),
    minMessages: z.number().int().min(1).max(1000).nullable(),
    countMode: z.enum(["customer_only", "customer_admin"]),
    mode: z.enum(["auto", "manual"]),
    eventName: z.string().trim().min(1).max(50).regex(/^[A-Za-z0-9_ ]+$/, "Nama event hanya huruf, angka, spasi, _"),
    value: z.number().int().min(0).nullable(),
    currency: z.string().trim().length(3).default("IDR"),
    enabled: z.boolean().default(true),
    keywords: z
      .array(
        z.object({
          keyword: z.string().trim().min(1).max(100),
          senderScope: z.enum(["lead", "admin", "both"]),
          match: z.enum(["contains", "word"]),
        }),
      )
      .max(100)
      .default([]),
  })
  .refine((b) => b.minMessages != null || b.keywords.length > 0, {
    message: "Isi minimal satu metrik: jumlah pesan atau kata kunci",
  });

type Body = z.infer<typeof body>;

const scopeOpts = { table: T, link: TW, linkOwner: TW.triggerId, label: "Trigger" };

async function ownedTrigger(userId: string, id: string) {
  const [t] = await db.select().from(T).where(and(eq(T.id, id), eq(T.userId, userId)));
  if (!t) throw new HTTPException(404, { message: "Trigger tidak ditemukan" });
  return t;
}

async function saveChildren(triggerId: string, b: Body) {
  await db.delete(TW).where(eq(TW.triggerId, triggerId));
  if (!b.applyAll && b.waAccountIds.length) {
    await db.insert(TW).values([...new Set(b.waAccountIds)].map((waAccountId) => ({ triggerId, waAccountId })));
  }
  await db.delete(K).where(eq(K.triggerId, triggerId));
  if (b.keywords.length) await db.insert(K).values(b.keywords.map((k) => ({ ...k, triggerId })));
}

const fields = (b: Body) => ({
  name: b.name,
  applyAll: b.applyAll,
  minMessages: b.minMessages,
  countMode: b.countMode,
  mode: b.mode,
  eventName: b.eventName,
  value: b.value,
  currency: b.currency.toUpperCase(),
  enabled: b.enabled,
});

export const triggerRoutes = new Hono<AppEnv>()
  .use(requireUser)
  .get("/", async (c) => {
    const user = c.get("user")!;
    const rows = await db.select().from(T).where(eq(T.userId, user.id)).orderBy(asc(T.createdAt));
    const ids = rows.map((r) => r.id);
    const [links, kws] = ids.length
      ? await Promise.all([
          db.select().from(TW).where(inArray(TW.triggerId, ids)),
          db.select().from(K).where(inArray(K.triggerId, ids)),
        ])
      : [[], []];
    return c.json(
      rows.map((t) => ({
        ...t,
        waAccountIds: links.filter((l) => l.triggerId === t.id).map((l) => l.waAccountId),
        keywords: kws
          .filter((k) => k.triggerId === t.id)
          .map(({ keyword, senderScope, match }) => ({ keyword, senderScope, match })),
      })),
    );
  })

  .post("/", v("json", body), async (c) => {
    const user = c.get("user")!;
    const b = c.req.valid("json");
    await validateScope({ userId: user.id, applyAll: b.applyAll, waAccountIds: b.waAccountIds, ...scopeOpts });
    const [t] = await db
      .insert(T)
      .values({ userId: user.id, ...fields(b) })
      .returning({ id: T.id });
    await saveChildren(t.id, b);
    return c.json({ id: t.id }, 201);
  })

  .put("/:id", v("param", z.object({ id: z.uuid() })), v("json", body), async (c) => {
    const user = c.get("user")!;
    const { id } = c.req.valid("param");
    const b = c.req.valid("json");
    await ownedTrigger(user.id, id);
    await validateScope({ userId: user.id, selfId: id, applyAll: b.applyAll, waAccountIds: b.waAccountIds, ...scopeOpts });
    await db.update(T).set(fields(b)).where(eq(T.id, id));
    await saveChildren(id, b);
    return c.json({ id });
  })

  .patch("/:id/enabled", v("param", z.object({ id: z.uuid() })), v("json", z.object({ enabled: z.boolean() })), async (c) => {
    const user = c.get("user")!;
    const { id } = c.req.valid("param");
    await ownedTrigger(user.id, id);
    await db.update(T).set({ enabled: c.req.valid("json").enabled }).where(eq(T.id, id));
    return c.json({ ok: true });
  })

  .delete("/:id", v("param", z.object({ id: z.uuid() })), async (c) => {
    const user = c.get("user")!;
    const { id } = c.req.valid("param");
    await ownedTrigger(user.id, id);
    await db.delete(T).where(eq(T.id, id));
    return c.json({ ok: true });
  });
