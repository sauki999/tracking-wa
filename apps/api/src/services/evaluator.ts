/**
 * Evaluasi Lead Metrix (fungsi murni, tanpa DB).
 * Lead = Potential bila SALAH SATU terpenuhi:
 *  - jumlah pesan >= minMessages (customer saja / customer + admin)
 *  - ada keyword yang cocok sesuai scope pengirimnya
 */

export type KeywordRule = {
  keyword: string;
  senderScope: "lead" | "admin" | "both";
  match: "contains" | "word";
};

export type TriggerRule = {
  id: string;
  minMessages: number | null;
  countMode: "customer_only" | "customer_admin";
  keywords: KeywordRule[];
};

export type EvalMessage = { fromMe: boolean; text: string | null };

export type EvalResult = {
  potential: boolean;
  messageCount: number;
  countMet: boolean;
  matchedKeywords: string[];
};

const normalize = (s: string) => s.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function keywordMatches(rule: KeywordRule, text: string): boolean {
  const kw = normalize(rule.keyword);
  if (!kw) return false;
  const t = normalize(text);
  if (rule.match === "contains") return t.includes(kw);
  // "word": dibatasi non-huruf/angka (unicode-aware)
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(kw)}($|[^\\p{L}\\p{N}])`, "u").test(t);
}

export function evaluate(
  rule: TriggerRule,
  counts: { inCount: number; outCount: number },
  messages: EvalMessage[],
): EvalResult {
  const messageCount = rule.countMode === "customer_admin" ? counts.inCount + counts.outCount : counts.inCount;
  const countMet = rule.minMessages != null && rule.minMessages > 0 && messageCount >= rule.minMessages;

  const matched = new Set<string>();
  for (const kw of rule.keywords) {
    for (const m of messages) {
      if (!m.text) continue;
      const scopeOk = kw.senderScope === "both" || (kw.senderScope === "admin" ? m.fromMe : !m.fromMe);
      if (scopeOk && keywordMatches(kw, m.text)) {
        matched.add(kw.keyword);
        break;
      }
    }
  }
  const matchedKeywords = [...matched];
  return { potential: countMet || matchedKeywords.length > 0, messageCount, countMet, matchedKeywords };
}
