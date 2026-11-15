import { v } from "../lib/validator";
import { and, asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { db, schema } from "../db";
import { type AppEnv, requireUser } from "../lib/context";
import { engine } from "../services/engine";

const t = schema.waAccounts;

async function ownedAccount(userId: string, id: string) {
  const [acc] = await db
    .select()
    .from(t)
    .where(and(eq(t.id, id), eq(t.userId, userId)));
  if (!acc) throw new HTTPException(404, { message: "Nomor tidak ditemukan" });
  return acc;
}

const idParam = v("param", z.object({ id: z.uuid() }));

export const waAccountRoutes = new Hono<AppEnv>()
  .use(requireUser)
  .get("/", async (c) => {
    const user = c.get("user")!;
    const rows = await db
      .select({
        id: t.id,
        label: t.label,
        phone: t.phone,
        pushName: t.pushName,
        status: t.status,
        lastConnectedAt: t.lastConnectedAt,
        createdAt: t.createdAt,
      })
      .from(t)
      .where(eq(t.userId, user.id))
      .orderBy(asc(t.createdAt));
    return c.json(rows);
  })

  // Tanpa batas jumlah nomor
  .post("/", v("json", z.object({ label: z.string().trim().max(60).optional() })), async (c) => {
    const user = c.get("user")!;
    const [acc] = await db
      .insert(t)
      .values({ userId: user.id, label: c.req.valid("json").label || null })
      .returning({ id: t.id });
    return c.json(acc, 201);
  })

  .patch("/:id", idParam, v("json", z.object({ label: z.string().trim().max(60) })), async (c) => {
    const user = c.get("user")!;
    const { id } = c.req.valid("param");
    await ownedAccount(user.id, id);
    await db.update(t).set({ label: c.req.valid("json").label || null }).where(eq(t.id, id));
    return c.json({ ok: true });
  })

  // SSE proxy ke engine: event qr | code | success | timeout | error
  .get("/:id/pair", idParam, v("query", z.object({ phone: z.string().regex(/^[1-9]\d{7,14}$/).optional() })), async (c) => {
    const user = c.get("user")!;
    const { id } = c.req.valid("param");
    const acc = await ownedAccount(user.id, id);
    if (acc.status === "connected") throw new HTTPException(409, { message: "Nomor sudah terhubung" });
    // Abort ke engine saat browser menutup stream (modal ditutup) -> pairing dibatalkan.
    // Signal request Bun tidak selalu ter-abort untuk response streaming, jadi
    // pembatalan dipicu dari cancel() stream response kita sendiri.
    const upstream = new AbortController();
    c.req.raw.signal.addEventListener("abort", () => upstream.abort());
    const res = await engine.pair(id, c.req.valid("query").phone, upstream.signal);
    if (!res.ok || !res.body) throw new HTTPException(502, { message: "Engine WhatsApp tidak tersedia" });
    const reader = res.body.getReader();
    const body = new ReadableStream<Uint8Array>({
      async pull(ctrl) {
        try {
          const { done, value } = await reader.read();
          if (done) ctrl.close();
          else ctrl.enqueue(value);
        } catch {
          ctrl.close();
        }
      },
      cancel() {
        upstream.abort();
        reader.cancel().catch(() => {});
      },
    });
    return new Response(body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
      },
    });
  })

  .post("/:id/logout", idParam, async (c) => {
    const user = c.get("user")!;
    const { id } = c.req.valid("param");
    await ownedAccount(user.id, id);
    await engine.logout(id);
    return c.json({ ok: true });
  })

  // Hapus nomor beserta seluruh lead & pesannya
  .delete("/:id", idParam, async (c) => {
    const user = c.get("user")!;
    const { id } = c.req.valid("param");
    await ownedAccount(user.id, id);
    await engine.logout(id).catch(() => {});
    await db.delete(t).where(eq(t.id, id));
    return c.json({ ok: true });
  });
