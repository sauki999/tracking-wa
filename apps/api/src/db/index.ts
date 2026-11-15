import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../env";
import * as schema from "./schema";

// pool kecil supaya hemat koneksi Postgres
export const sql = postgres(env.DATABASE_URL, { max: 5, idle_timeout: 30 });
export const db = drizzle(sql, { schema });
export { schema };
