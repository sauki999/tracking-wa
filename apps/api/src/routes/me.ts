import { Hono } from "hono";
import type { AppEnv } from "../lib/context";
import { requireUser } from "../lib/context";

export const meRoutes = new Hono<AppEnv>().use(requireUser).get("/", async (c) => {
  const user = c.get("user")!;
  return c.json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
});
