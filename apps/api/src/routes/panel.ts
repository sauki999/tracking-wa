import { and, count, desc, eq, ilike, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { auth } from "../auth";
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
        numbers: sql<number>`(SELECT count(*)::int FROM wa_accounts a WHERE a.user_id = ${UID} OR a.assigned_user_id = ${UID})`,
        connected: sql<number>`(SELECT count(*)::int FROM wa_accounts a WHERE (a.user_id = ${UID} OR a.assigned_user_id = ${UID}) AND a.status = 'connected')`,
        leads: sql<number>`(SELECT count(*)::int FROM leads l JOIN wa_accounts a ON a.id = l.wa_account_id WHERE a.user_id = ${UID} OR a.assigned_user_id = ${UID})`,
        capiSent: sql<number>`(SELECT count(*)::int FROM capi_events e JOIN leads l ON l.id = e.lead_id JOIN wa_accounts a ON a.id = l.wa_account_id WHERE (a.user_id = ${UID} OR a.assigned_user_id = ${UID}) AND e.status = 'success')`,
      })
      .from(U)
      .where(like ? or(ilike(U.email, like), ilike(U.name, like)) : undefined)
      .orderBy(desc(U.createdAt))
      .limit(200);
    return c.json(rows);
  })

  .post(
    "/users",
    v(
      "json",
      z.object({
        name: z.string().trim().min(2).max(100),
        email: z.string().trim().email(),
        password: z.string().min(8).max(128),
        role: z.enum(["user", "admin"]).default("user"),
      }),
    ),
    async (c) => {
      const { name, email, password, role } = c.req.valid("json");
      const emailLower = email.toLowerCase();
      const [existing] = await db.select({ id: U.id }).from(U).where(eq(U.email, emailLower));
      if (existing) {
        throw new HTTPException(400, { message: "Email sudah terdaftar" });
      }

      try {
        const ctx = await auth.$context;
        const hashedPassword = await ctx.password.hash(password);
        const userId = crypto.randomUUID();
        const accountId = crypto.randomUUID();

        await db.insert(U).values({
          id: userId,
          name,
          email: emailLower,
          emailVerified: true,
          role,
          suspended: false,
        });

        await db.insert(schema.account).values({
          id: accountId,
          accountId: userId,
          providerId: "credential",
          userId,
          password: hashedPassword,
        });

        return c.json({ ok: true, user: { id: userId, name, email: emailLower, role } });
      } catch (err: any) {
        throw new HTTPException(400, { message: err.message || "Gagal membuat user" });
      }
    },
  )

  .get("/users/:id", idParam, async (c) => {
    const { id } = c.req.valid("param");
    const [user] = await db.select().from(U).where(eq(U.id, id));
    if (!user) throw new HTTPException(404, { message: "User tidak ditemukan" });
    const accounts = await db.select().from(A).where(or(eq(A.userId, id), eq(A.assignedUserId, id))).orderBy(A.createdAt);
    return c.json({ user, accounts });
  })

  .patch(
    "/users/:id",
    idParam,
    v(
      "json",
      z.object({
        name: z.string().trim().min(2).max(100).optional(),
        email: z.string().trim().email().optional(),
        password: z.string().min(8).max(128).optional(),
        suspended: z.boolean().optional(),
        role: z.enum(["user", "admin"]).optional(),
      }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const b = c.req.valid("json");
      if (id === c.get("user")!.id && (b.suspended || b.role === "user")) {
        throw new HTTPException(400, { message: "Tidak bisa menonaktifkan / menurunkan diri sendiri" });
      }

      const updateData: Record<string, any> = {};
      if (b.name !== undefined) updateData.name = b.name;
      if (b.email !== undefined) {
        const emailLower = b.email.toLowerCase();
        const [dup] = await db.select({ id: U.id }).from(U).where(and(eq(U.email, emailLower), sql`${U.id} <> ${id}`));
        if (dup) throw new HTTPException(400, { message: "Email sudah dipakai user lain" });
        updateData.email = emailLower;
      }
      if (b.suspended !== undefined) updateData.suspended = b.suspended;
      if (b.role !== undefined) updateData.role = b.role;

      if (Object.keys(updateData).length > 0) {
        await db.update(U).set(updateData).where(eq(U.id, id));
      }

      if (b.password) {
        const ctx = await auth.$context;
        const hashedPassword = await ctx.password.hash(b.password);
        await db
          .update(schema.account)
          .set({ password: hashedPassword })
          .where(and(eq(schema.account.userId, id), eq(schema.account.providerId, "credential")));
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

  .delete("/users/:id", idParam, async (c) => {
    const { id } = c.req.valid("param");
    if (id === c.get("user")!.id) {
      throw new HTTPException(400, { message: "Tidak bisa menghapus akun sendiri" });
    }
    await db.delete(schema.session).where(eq(schema.session.userId, id));
    await db.delete(schema.account).where(eq(schema.account.userId, id));
    // Release assigned wa accounts
    await db.update(A).set({ assignedUserId: null }).where(eq(A.assignedUserId, id));
    await db.delete(U).where(eq(U.id, id));
    return c.json({ ok: true });
  })

  .get("/stats", async (c) => {
    const [[users], [accounts], [connected], metrics] = await Promise.all([
      db.select({ n: count() }).from(U),
      db.select({ n: count() }).from(A),
      db.select({ n: count() }).from(A).where(eq(A.status, "connected")),
      engine.metrics().catch(() => null),
    ]);
    return c.json({ users: users.n, numbers: accounts.n, connected: connected.n, engine: metrics });
  });
