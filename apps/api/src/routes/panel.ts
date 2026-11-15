import { and, count, desc, eq, ilike, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { db, schema } from "../db";
import { type AppEnv, requireAdmin } from "../lib/context";
import { v } from "../lib/validator";
import { engine } from "../services/engine";
import { publish } from "../services/realtime";

const U = schema.user;
const A = schema.waAccounts;

const UID = sql.raw('"user"."id"');
const idParam = v("param", z.object({ id: z.string().min(1).max(64) }));

export const panelRoutes = new Hono<AppEnv>()
  .use(requireAdmin)

  .get("/users", v("query", z.object({ q: z.string().trim().max(100).optional() })), async (c) => {
    const { q } = c.req.valid("query");
    const like = q ? `%${q}%` : null;
    const rows = await db
      .select({
        id: U.id,
        name: U.name,
        email: U.email,
        role: U.role,
        suspended: U.suspended,
        createdAt: U.createdAt,
        numbers: sql<number>`(SELECT count(*)::int FROM wa_accounts a WHERE a.user_id = ${UID})`,
        connected: sql<number>`(SELECT count(*)::int FROM wa_accounts a WHERE a.user_id = ${UID} AND a.status = 'connected')`,
        leads: sql<number>`(SELECT count(*)::int FROM leads l JOIN wa_accounts a ON a.id = l.wa_account_id WHERE a.user_id = ${UID})`,
        capiSent: sql<number>`(SELECT count(*)::int FROM capi_events e JOIN leads l ON l.id = e.lead_id JOIN wa_accounts a ON a.id = l.wa_account_id WHERE a.user_id = ${UID} AND e.status = 'success')`,
      })
      .from(U)
      .where(like ? or(ilike(U.email, like), ilike(U.name, like)) : undefined)
      .orderBy(desc(U.createdAt))
      .limit(200);
    return c.json(rows);
  })

  .get("/users/:id", idParam, async (c) => {
    const { id } = c.req.valid("param");
    const [user] = await db.select().from(U).where(eq(U.id, id));
    if (!user) throw new HTTPException(404, { message: "User tidak ditemukan" });
    const accounts = await db.select().from(A).where(eq(A.userId, id)).orderBy(A.createdAt);
    return c.json({ user, accounts });
  })

  .patch(
    "/users/:id",
    idParam,
    v("json", z.object({ suspended: z.boolean().optional(), role: z.enum(["user", "admin"]).optional() })),
    async (c) => {
      const { id } = c.req.valid("param");
      const b = c.req.valid("json");
      if (id === c.get("user")!.id && (b.suspended || b.role === "user")) {
        throw new HTTPException(400, { message: "Tidak bisa menonaktifkan / menurunkan diri sendiri" });
      }
      if (b.suspended !== undefined || b.role !== undefined) {
        await db
          .update(U)
          .set({ ...(b.suspended !== undefined && { suspended: b.suspended }), ...(b.role && { role: b.role }) })
          .where(eq(U.id, id));
      }
      if (b.suspended) {
        // putus semua sesi & logout paksa dari web
        await db.delete(schema.session).where(eq(schema.session.userId, id));
        const accs = await db.select({ id: A.id }).from(A).where(and(eq(A.userId, id), eq(A.status, "connected")));
        for (const a of accs) await engine.suspend(a.id).catch(() => {});
      }
      return c.json({ ok: true });
    },
  )

  .get("/stats", async (c) => {
    const [[users], [accounts], [connected], metrics] = await Promise.all([
      db.select({ n: count() }).from(U),
      db.select({ n: count() }).from(A),
      db.select({ n: count() }).from(A).where(eq(A.status, "connected")),
      engine.metrics().catch(() => null),
    ]);
    return c.json({ users: users.n, numbers: accounts.n, connected: connected.n, engine: metrics });
  });
