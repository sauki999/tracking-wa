import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

type RealtimeEvent =
  | { type: "leads"; leadIds: string[] }
  | { type: "account"; accountId: string; status: string }
  | { type: "status" };

/** Satu koneksi SSE per tab; invalidasi cache react-query saat ada event */
export function useRealtime(enabled: boolean) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    const es = new EventSource("/api/events");
    es.addEventListener("message", (e) => {
      const ev = JSON.parse(e.data) as RealtimeEvent;
      if (ev.type === "leads") {
        qc.invalidateQueries({ queryKey: ["leads"] });
        for (const id of ev.leadIds) {
          qc.invalidateQueries({ queryKey: ["lead", id] });
          qc.invalidateQueries({ queryKey: ["messages", id] });
        }
        qc.invalidateQueries({ queryKey: ["me"] });
      } else if (ev.type === "account") {
        qc.invalidateQueries({ queryKey: ["wa-accounts"] });
      } else if (ev.type === "status") {
        qc.invalidateQueries({ queryKey: ["me"] });
      }
    });
    // EventSource reconnect otomatis; setelah reconnect, segarkan data
    es.addEventListener("ready", () => qc.invalidateQueries({ queryKey: ["leads"] }));
    return () => es.close();
  }, [enabled, qc]);
}
