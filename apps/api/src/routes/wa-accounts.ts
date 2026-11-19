import { v } from "../lib/validator";
import { and, asc, eq, or } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { AuthUser } from "../auth";
import { db, schema } from "../db";
import { type AppEnv, requireUser } from "../lib/context";
import { engine } from "../services/engine";

const t = schema.waAccounts;

async function ownedAccount(user: AuthUser, id: string) {
  if (user.role === "admin") {
    const [acc] = await db.select().from(t).where(eq(t.id, id));
    if (!acc) throw new HTTPException(404, { message: "Nomor tidak ditemukan" });
    return acc;
  }
  const [acc] = await db
    .select()
    .from(t)
    .where(and(eq(t.id, id), or(eq(t.userId, user.id), eq(t.assignedUserId, user.id))));
  if (!acc) throw new HTTPException(404, { message: "Nomor tidak ditemukan" });
  return acc;
}

const idParam = v("param", z.object({ id: z.uuid() }));

export const waAccountRoutes = new Hono<AppEnv>()
  .use(requireUser)
  .get("/", async (c) => {
    const user = c.get("user")!;
    const baseQuery = db
      .select({
        id: t.id,
        label: t.label,
        phone: t.phone,
        pushName: t.pushName,
        status: t.status,
        lastConnectedAt: t.lastConnectedAt,
        createdAt: t.createdAt,
        assignedUserId: t.assignedUserId,
        assignedUser: {
          id: schema.user.id,
          name: schema.user.name,
          email: schema.user.email,
        },
      })
      .from(t)
      .leftJoin(schema.user, eq(t.assignedUserId, schema.user.id))
      .orderBy(asc(t.createdAt));

    if (user.role === "admin") {
      const rows = await baseQuery;
      return c.json(rows);
    }

    const rows = await baseQuery.where(or(eq(t.userId, user.id), eq(t.assignedUserId, user.id)));
    return c.json(rows);
  })

  // Tanpa batas jumlah nomor
  .post(
    "/",
    v("json", z.object({ label: z.string().trim().max(60).optional(), assignedUserId: z.string().optional() })),
    async (c) => {
      const user = c.get("user")!;
      const b = c.req.valid("json");
      const [acc] = await db
        .insert(t)
        .values({
          userId: user.id,
          label: b.label || null,
          assignedUserId: user.role === "admin" && b.assignedUserId ? b.assignedUserId : null,
        })
        .returning({ id: t.id });
      return c.json(acc, 201);
    },
  )

  .patch(
    "/:id",
    idParam,
    v(
      "json",
      z.object({
        label: z.string().trim().max(60).optional(),
        assignedUserId: z.string().nullable().optional(),
      }),
    ),
    async (c) => {
      const user = c.get("user")!;
      const { id } = c.req.valid("param");
      await ownedAccount(user, id);
      const b = c.req.valid("json");
      const updateData: Record<string, any> = {};
      if (b.label !== undefined) updateData.label = b.label || null;
      if (user.role === "admin" && b.assignedUserId !== undefined) {
        updateData.assignedUserId = b.assignedUserId || null;
      }
      if (Object.keys(updateData).length > 0) {
        await db.update(t).set(updateData).where(eq(t.id, id));
      }
      return c.json({ ok: true });
    },
  )

  // SSE proxy ke engine: event qr | code | success | timeout | error
  .get("/:id/pair", idParam, v("query", z.object({ phone: z.string().regex(/^[1-9]\d{7,14}$/).optional() })), async (c) => {
    const user = c.get("user")!;
    const { id } = c.req.valid("param");
    const acc = await ownedAccount(user, id);
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
    await ownedAccount(user, id);
    await engine.logout(id);
    return c.json({ ok: true });
  })

  // Hapus nomor beserta seluruh lead & pesannya
  .delete("/:id", idParam, async (c) => {
    const user = c.get("user")!;
    const { id } = c.req.valid("param");
    await ownedAccount(user, id);
    await engine.logout(id).catch(() => {});
    await db.delete(t).where(eq(t.id, id));
    return c.json({ ok: true });
  });
