/** Jadikan user admin: `bun src/db/make-admin.ts <email>` */
import { eq } from "drizzle-orm";
import { db, schema, sql } from "./index";

const email = process.argv[2];
if (!email) throw new Error("usage: bun src/db/make-admin.ts <email>");
const rows = await db.update(schema.user).set({ role: "admin" }).where(eq(schema.user.email, email)).returning({ id: schema.user.id });
console.log(rows.length ? `${email} sekarang admin` : `user ${email} tidak ditemukan (daftar dulu di /register)`);
await sql.end();
