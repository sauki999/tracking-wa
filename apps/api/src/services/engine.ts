import { env } from "../env";

/** Klien API internal engine Go */
async function call(path: string, init?: RequestInit & { signal?: AbortSignal }) {
  return fetch(`${env.ENGINE_URL}${path}`, {
    ...init,
    headers: { "X-Internal-Token": env.INTERNAL_TOKEN, ...(init?.headers ?? {}) },
  });
}

export const engine = {
  /** SSE stream pairing (QR / kode). Abort signal = batalkan pairing. */
  pair(accountId: string, phone: string | undefined, signal: AbortSignal) {
    const q = phone ? `?phone=${encodeURIComponent(phone)}` : "";
    return call(`/sessions/${accountId}/pair${q}`, { signal });
  },
  async logout(accountId: string) {
    const r = await call(`/sessions/${accountId}/logout`, { method: "POST" });
    if (!r.ok) throw new Error(`engine logout: ${r.status}`);
  },
  async suspend(accountId: string) {
    await call(`/sessions/${accountId}/suspend`, { method: "POST" });
  },
  async resume(accountId: string) {
    const r = await call(`/sessions/${accountId}/resume`, { method: "POST" });
    return r.ok;
  },
  async metrics() {
    const r = await call(`/metrics`);
    return r.ok ? ((await r.json()) as Record<string, number>) : null;
  },
};
