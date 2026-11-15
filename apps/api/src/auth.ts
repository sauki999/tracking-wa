import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { count } from "drizzle-orm";
import { db, schema } from "./db";
import { env } from "./env";

export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  basePath: "/api/auth",
  trustedOrigins: [env.APP_URL],
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  emailAndPassword: { enabled: true, minPasswordLength: 8 },
  user: {
    additionalFields: {
      role: { type: "string", input: false, defaultValue: "user" },
      suspended: { type: "boolean", input: false, defaultValue: false },
    },
  },
  advanced: { database: { generateId: () => crypto.randomUUID() } },
  databaseHooks: {
    user: {
      create: {
        // user pertama yang mendaftar otomatis jadi admin
        before: async (user) => {
          const [{ n }] = await db.select({ n: count() }).from(schema.user);
          return { data: { ...user, role: n === 0 ? "admin" : "user" } };
        },
      },
    },
  },
});

export type AuthUser = typeof auth.$Infer.Session.user;
export type AuthSession = typeof auth.$Infer.Session.session;
