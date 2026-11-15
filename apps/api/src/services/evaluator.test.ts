import { describe, expect, test } from "bun:test";
import { evaluate, keywordMatches, type TriggerRule } from "./evaluator";

const base: TriggerRule = { id: "t", minMessages: 5, countMode: "customer_only", keywords: [] };

describe("keywordMatches", () => {
  test("contains: case & spasi tidak berpengaruh", () => {
    expect(keywordMatches({ keyword: "No  Rekening", senderScope: "both", match: "contains" }, "ini no rekening kami")).toBe(true);
  });
  test("word: tidak cocok di tengah kata", () => {
    const r = { keyword: "dp", senderScope: "both", match: "word" } as const;
    expect(keywordMatches(r, "sudah transfer DP ya")).toBe(true);
    expect(keywordMatches(r, "dpr")).toBe(false);
    expect(keywordMatches(r, "DP.")).toBe(true);
  });
  test("keyword dengan karakter regex aman", () => {
    expect(keywordMatches({ keyword: "harga?", senderScope: "both", match: "word" }, "berapa harga? kak")).toBe(true);
  });
});

describe("evaluate", () => {
  test("customer_only menghitung pesan masuk saja", () => {
    const r = evaluate(base, { inCount: 4, outCount: 10 }, []);
    expect(r.potential).toBe(false);
    expect(r.messageCount).toBe(4);
  });
  test("customer_admin menjumlahkan keduanya", () => {
    const r = evaluate({ ...base, countMode: "customer_admin" }, { inCount: 2, outCount: 3 }, []);
    expect(r.countMet).toBe(true);
    expect(r.potential).toBe(true);
  });
  test("minMessages null = metrik jumlah tidak dipakai", () => {
    expect(evaluate({ ...base, minMessages: null }, { inCount: 100, outCount: 0 }, []).potential).toBe(false);
  });
  test("keyword sesuai scope pengirim", () => {
    const rule: TriggerRule = {
      ...base,
      minMessages: null,
      keywords: [
        { keyword: "rekening", senderScope: "admin", match: "contains" },
        { keyword: "mau order", senderScope: "lead", match: "contains" },
      ],
    };
    // "rekening" dari lead tidak dihitung karena scope admin
    const r1 = evaluate(rule, { inCount: 1, outCount: 0 }, [{ fromMe: false, text: "minta nomor rekening" }]);
    expect(r1.potential).toBe(false);
    const r2 = evaluate(rule, { inCount: 1, outCount: 1 }, [
      { fromMe: false, text: "Kak saya MAU ORDER" },
      { fromMe: true, text: "Silakan transfer ke rekening BCA" },
    ]);
    expect(r2.matchedKeywords.sort()).toEqual(["mau order", "rekening"]);
    expect(r2.potential).toBe(true);
  });
});
