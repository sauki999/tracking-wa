import { and, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "../db";
import { sendLeadToMeta } from "./capi";
import { evaluate } from "./evaluator";
import { onIngest } from "./realtime";
import { resolveTrigger, type ResolvedTrigger } from "./resolve";

const L = schema.leads;

/** Dipanggil tiap ada pesan baru (NOTIFY ctwa_ingest dari engine) */
export async function evaluateLeads(leadIds: string[]) {
  const leads = await db
    .select({
      id: L.id,
      waAccountId: L.waAccountId,
      userId: schema.waAccounts.userId,
      inCount: L.msgInCount,
      outCount: L.msgOutCount,
    })
    .from(L)
    .innerJoin(schema.waAccounts, eq(L.waAccountId, schema.waAccounts.id))
    // lead yang sudah Potential tidak dievaluasi ulang
    .where(and(inArray(L.id, leadIds), eq(L.isPotential, false)));

  const ruleCache = new Map<string, ResolvedTrigger | null>();
  for (const lead of leads) {
    let rule = ruleCache.get(lead.waAccountId);
    if (rule === undefined) {
      rule = await resolveTrigger(lead.userId, lead.waAccountId);
      ruleCache.set(lead.waAccountId, rule);
    }
    if (!rule) continue;

    const messages = rule.keywords.length
      ? await db
          .select({ fromMe: schema.messages.fromMe, text: schema.messages.text })
          .from(schema.messages)
          .where(eq(schema.messages.leadId, lead.id))
          .orderBy(desc(schema.messages.id))
          .limit(300)
      : [];
    const res = evaluate(rule, { inCount: lead.inCount, outCount: lead.outCount }, messages);
    if (!res.potential) continue;

    const updated = await db
      .update(L)
      .set({
        isPotential: true,
        potentialAt: new Date(),
        potentialReason: {
          triggerId: rule.id,
          messageCount: res.countMet ? res.messageCount : undefined,
          keywords: res.matchedKeywords.length ? res.matchedKeywords : undefined,
        },
      })
      .where(and(eq(L.id, lead.id), eq(L.isPotential, false)))
      .returning({ id: L.id });
    if (!updated.length) continue; // sudah ditandai proses lain

    if (rule.mode === "auto") {
      const r = await sendLeadToMeta(lead.id, { trigger: "auto" });
      if (!r.ok && r.code !== "already_sent") console.warn(`auto CAPI skipped lead=${lead.id}: ${r.code} ${r.message}`);
    }
  }
}

export function registerTriggerRunner() {
  onIngest(evaluateLeads);
}
