import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { auth, type AuthSession, type AuthUser } from "../auth";

export type AppEnv = {
  Variables: { user: AuthUser | null; session: AuthSession | null };
};

export const sessionMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const s = await auth.api.getSession({ headers: c.req.raw.headers });
  c.set("user", s?.user ?? null);
  c.set("session", s?.session ?? null);
  await next();
});

export const requireUser = createMiddleware<AppEnv & { Variables: { user: AuthUser } }>(
  async (c, next) => {
    const user = c.get("user");
    if (!user) throw new HTTPException(401, { message: "Unauthorized" });
    if (user.suspended) throw new HTTPException(403, { message: "Akun dinonaktifkan" });
    await next();
  },
);

export const requireAdmin = createMiddleware<AppEnv & { Variables: { user: AuthUser } }>(
  async (c, next) => {
    const user = c.get("user");
    if (!user || user.role !== "admin") throw new HTTPException(403, { message: "Forbidden" });
    await next();
  },
);
