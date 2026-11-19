import { join } from "node:path";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db, sql } from "./index";

await migrate(db, { migrationsFolder: join(import.meta.dir, "../../drizzle") });
await sql`ALTER TABLE wa_accounts ADD COLUMN IF NOT EXISTS assigned_user_id text REFERENCES "user"(id) ON DELETE SET NULL;`;
await sql`CREATE INDEX IF NOT EXISTS wa_accounts_assigned_user_idx ON wa_accounts(assigned_user_id);`;
console.log("migrations applied");
await sql.end();
