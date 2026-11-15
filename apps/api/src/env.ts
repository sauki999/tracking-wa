import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().default(3000),
  APP_URL: z.string().url().default("http://localhost:5173"),
  BETTER_AUTH_SECRET: z.string().min(16),
  BETTER_AUTH_URL: z.string().url().default("http://localhost:3000"),
  ENCRYPTION_KEY: z.string().regex(/^[0-9a-f]{64}$/i, "32 byte hex"),
  META_GRAPH_VERSION: z.string().default("v23.0"),
  ENGINE_URL: z.string().url().default("http://localhost:8080"),
  INTERNAL_TOKEN: z.string().min(8),
  WEB_DIST: z.string().default("../web/dist"),
});

export const env = schema.parse(process.env);
