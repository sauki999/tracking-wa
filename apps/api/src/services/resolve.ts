import { and, desc, eq, or, sql } from "drizzle-orm";
import { db, schema } from "../db";
import type { TriggerRule } from "./evaluator";

const P = schema.pixels;
const PW = schema.pixelWaAccounts;
const T = schema.triggers;
const TW = schema.triggerWaAccounts;

/**
 * Pixel yang berlaku untuk nomor: pixel khusus nomor tsb menang atas
 * pixel "semua nomor".
 */
export async function resolvePixel(userId: string, waAccountId: string) {
  const specific = sql<boolean>`${PW.waAccountId} IS NOT NULL`;
  const [row] = await db
    .select({ pixel: P })
    .from(P)
    .leftJoin(PW, and(eq(PW.pixelId, P.id), eq(PW.waAccountId, waAccountId)))
    .where(and(eq(P.userId, userId), or(eq(P.applyAll, true), eq(PW.waAccountId, waAccountId))))
    .orderBy(desc(specific), desc(P.createdAt))
    .limit(1);
  return row?.pixel ?? null;
}

export type ResolvedTrigger = TriggerRule & {
  mode: "auto" | "manual";
  eventName: string;
  value: number | null;
  currency: string | null;
  name: string;
};

/** Trigger aktif untuk nomor (khusus nomor menang atas "semua nomor") */
export async function resolveTrigger(userId: string, waAccountId: string): Promise<ResolvedTrigger | null> {
  const specific = sql<boolean>`${TW.waAccountId} IS NOT NULL`;
  const [row] = await db
    .select({ t: T })
    .from(T)
    .leftJoin(TW, and(eq(TW.triggerId, T.id), eq(TW.waAccountId, waAccountId)))
    .where(
      and(eq(T.userId, userId), eq(T.enabled, true), or(eq(T.applyAll, true), eq(TW.waAccountId, waAccountId))),
    )
    .orderBy(desc(specific), desc(T.createdAt))
    .limit(1);
  if (!row) return null;
  const t = row.t;
  const keywords = await db
    .select({
      keyword: schema.triggerKeywords.keyword,
      senderScope: schema.triggerKeywords.senderScope,
      match: schema.triggerKeywords.match,
    })
    .from(schema.triggerKeywords)
    .where(eq(schema.triggerKeywords.triggerId, t.id));
  return {
    id: t.id,
    name: t.name,
    minMessages: t.minMessages,
    countMode: t.countMode,
    keywords,
    mode: t.mode,
    eventName: t.eventName,
    value: t.value,
    currency: t.currency,
  };
}
