import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db, schema } from "../db";
import { type AppEnv, requireUser } from "../lib/context";
import { v } from "../lib/validator";
import { CAPI_LOG_LIMIT } from "../services/capi-log";

const L = schema.capiLogs;

/** Log audit panggilan Conversions API milik user (maks. 200 terbaru) */
export const capiLogRoutes = new Hono<AppEnv>()
  .use(requireUser)
  .get("/", v("query", z.object({ status: z.enum(["all", "failed"]).default("all") })), async (c) => {
    const user = c.get("user")!;
    const { status } = c.req.valid("query");
    const rows = await db
      .select({
        id: L.id,
        source: L.source,
        datasetId: L.datasetId,
        pixelName: schema.pixels.name,
        leadId: L.leadId,
        leadName: schema.leads.name,
        leadPhone: schema.leads.phone,
        eventName: L.eventName,
        testEventCode: L.testEventCode,
        attempt: L.attempt,
        ok: L.ok,
        httpStatus: L.httpStatus,
        durationMs: L.durationMs,
        request: L.request,
        response: L.response,
        fbtraceId: L.fbtraceId,
        errorMessage: L.errorMessage,
        createdAt: L.createdAt,
      })
      .from(L)
      .leftJoin(schema.pixels, eq(schema.pixels.id, L.pixelId))
      .leftJoin(schema.leads, eq(schema.leads.id, L.leadId))
      .where(and(eq(L.userId, user.id), status === "failed" ? eq(L.ok, false) : undefined))
      .orderBy(desc(L.id))
      .limit(CAPI_LOG_LIMIT);
    return c.json({ items: rows, limit: CAPI_LOG_LIMIT });
  });
