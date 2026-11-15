import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL! },
  // tabel whatsmeow_* dikelola oleh engine Go, jangan disentuh drizzle
  tablesFilter: ["!whatsmeow_*"],
});
