import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { type AppEnv, requireUser } from "../lib/context";
import { subscribe } from "../services/realtime";

/** SSE per user: update lead & status nomor secara realtime */
export const eventRoutes = new Hono<AppEnv>().use(requireUser).get("/", (c) => {
  const user = c.get("user")!;
  return streamSSE(c, async (stream) => {
    const queue: string[] = [];
    let wake: (() => void) | null = null;
    const unsub = subscribe(user.id, (e) => {
      queue.push(JSON.stringify(e));
      wake?.();
    });
    stream.onAbort(() => {
      unsub();
      wake?.();
    });

    await stream.writeSSE({ event: "ready", data: "{}" });
    while (!stream.aborted) {
      if (queue.length === 0) {
        // tunggu event baru atau heartbeat 25 dtk
        await new Promise<void>((resolve) => {
          wake = resolve;
          setTimeout(resolve, 25_000);
        });
        wake = null;
      }
      if (stream.aborted) break;
      if (queue.length === 0) {
        await stream.writeSSE({ event: "ping", data: "{}" });
        continue;
      }
      for (const data of queue.splice(0)) await stream.writeSSE({ event: "message", data });
    }
    unsub();
  });
});
