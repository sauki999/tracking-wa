import { sql } from "drizzle-orm";
import { db, schema } from "../db";
import type { OnCapiCall } from "./meta";

/** Jumlah log yang disimpan per user; yang lebih lama dihapus */
export const CAPI_LOG_LIMIT = 200;

export type CapiLogSource = "send_auto" | "send_manual" | "validate" | "test";

/**
 * Callback untuk sendEvents/validatePixel: simpan setiap panggilan ke capi_logs
 * lalu pangkas supaya tersisa CAPI_LOG_LIMIT terbaru milik user.
 */
export function capiLogger(ctx: {
  userId: string;
  source: CapiLogSource;
  pixelId?: string | null;
  leadId?: string | null;
  attempt?: number;
}): OnCapiCall {
  return async (call) => {
    const L = schema.capiLogs;
    await db.insert(L).values({
      userId: ctx.userId,
      pixelId: ctx.pixelId ?? null,
      leadId: ctx.leadId ?? null,
      source: ctx.source,
      attempt: ctx.attempt ?? 1,
      datasetId: call.datasetId,
      eventName: call.request.data[0]?.event_name ?? null,
      testEventCode: call.request.test_event_code ?? null,
      ok: call.ok,
      httpStatus: call.httpStatus,
      durationMs: call.durationMs,
      request: call.request,
      response: (call.response ?? null) as object | null,
      fbtraceId: call.fbtraceId,
      errorMessage: call.errorMessage,
    });
    await db.execute(sql`
      DELETE FROM ${L} WHERE ${L.userId} = ${ctx.userId} AND ${L.id} < (
        SELECT ${L.id} FROM ${L} WHERE ${L.userId} = ${ctx.userId}
        ORDER BY ${L.id} DESC OFFSET ${CAPI_LOG_LIMIT - 1} LIMIT 1
      )`);
  };
}
