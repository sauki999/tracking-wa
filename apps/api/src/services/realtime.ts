import { inArray, eq } from "drizzle-orm";
import { db, schema, sql } from "../db";

/**
 * Realtime: satu koneksi LISTEN untuk seluruh app. Notifikasi dari engine
 * (ctwa_ingest, ctwa_account) dipetakan ke user lalu dikirim ke stream SSE
 * milik user tsb. Hook onIngest dipakai trigger evaluator.
 */

export type RealtimeEvent =
  | { type: "leads"; leadIds: string[] }
  | { type: "account"; accountId: string; status: string }
  | { type: "status" }; // data akun berubah -> refetch /me

type Listener = (e: RealtimeEvent) => void;

const subscribers = new Map<string, Set<Listener>>();
const ingestHooks: ((leadIds: string[]) => Promise<void>)[] = [];

export function subscribe(userId: string, fn: Listener) {
  let set = subscribers.get(userId);
  if (!set) subscribers.set(userId, (set = new Set()));
  set.add(fn);
  return () => {
    set.delete(fn);
    if (set.size === 0) subscribers.delete(userId);
  };
}

export function publish(userId: string, e: RealtimeEvent) {
  subscribers.get(userId)?.forEach((fn) => {
    try {
      fn(e);
    } catch {
      /* stream tertutup */
    }
  });
}

/** Didaftarkan modul lain (trigger evaluator) untuk memproses lead yang berubah */
export function onIngest(fn: (leadIds: string[]) => Promise<void>) {
  ingestHooks.push(fn);
}

async function handleIngest(payload: string) {
  let ids: string[];
  try {
    ids = JSON.parse(payload);
  } catch {
    return;
  }
  if (!ids.length) return;

  // jalankan evaluator dulu supaya event ke UI sudah membawa status terbaru
  for (const hook of ingestHooks) {
    await hook(ids).catch((err) => console.error("ingest hook failed", err));
  }

  const rows = await db
    .select({ id: schema.leads.id, userId: schema.waAccounts.userId })
    .from(schema.leads)
    .innerJoin(schema.waAccounts, eq(schema.leads.waAccountId, schema.waAccounts.id))
    .where(inArray(schema.leads.id, ids));
  const byUser = new Map<string, string[]>();
  for (const r of rows) byUser.set(r.userId, [...(byUser.get(r.userId) ?? []), r.id]);
  for (const [userId, leadIds] of byUser) publish(userId, { type: "leads", leadIds });
}

async function handleAccount(payload: string) {
  let p: { accountId: string; status: string };
  try {
    p = JSON.parse(payload);
  } catch {
    return;
  }
  const [acc] = await db
    .select({ userId: schema.waAccounts.userId })
    .from(schema.waAccounts)
    .where(eq(schema.waAccounts.id, p.accountId));
  if (acc) publish(acc.userId, { type: "account", accountId: p.accountId, status: p.status });
}

export async function startRealtime() {
  // postgres.js membuat koneksi khusus untuk LISTEN dan reconnect otomatis
  await sql.listen("ctwa_ingest", (p) => void handleIngest(p).catch(console.error));
  await sql.listen("ctwa_account", (p) => void handleAccount(p).catch(console.error));
  console.log("realtime: listening ctwa_ingest, ctwa_account");
}
