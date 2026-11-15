/**
 * Data contoh untuk development: `bun src/db/seed-dev.ts <email>`
 * Membuat beberapa lead + pesan pada nomor WA pertama milik user tsb.
 * Hanya untuk DB lokal.
 */
import { eq } from "drizzle-orm";
import { db, schema, sql } from "./index";

const email = process.argv[2];
if (!email) throw new Error("usage: bun src/db/seed-dev.ts <email>");
if (!/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? "")) throw new Error("seed hanya untuk DB lokal");

const [u] = await db.select().from(schema.user).where(eq(schema.user.email, email));
if (!u) throw new Error("user not found");
let [acc] = await db.select().from(schema.waAccounts).where(eq(schema.waAccounts.userId, u.id));
if (!acc) [acc] = await db.insert(schema.waAccounts).values({ userId: u.id, label: "Dev" }).returning();

type Msg = [fromMe: boolean, type: (typeof schema.messageType.enumValues)[number], text: string | null];
const samples: { name: string; phone: string; ad?: boolean; msgs: Msg[] }[] = [
  {
    name: "Rina Kusuma",
    phone: "6281234500001",
    ad: true,
    msgs: [
      [false, "text", "Halo kak, saya lihat iklannya. Kelas digital marketing masih buka?"],
      [true, "text", "Halo kak Rina, masih buka. Mau ambil yang reguler atau private?"],
      [false, "text", "Reguler dulu kak. Harganya berapa ya?"],
      [true, "text", "Reguler Rp1.500.000 kak, bisa dicicil 2x."],
      [false, "image", "ini bukti transfer DP ya kak"],
      [true, "text", "Siap kak, sudah kami terima. Terima kasih 🙏"],
    ],
  },
  {
    name: "Budi Santoso",
    phone: "6281234500002",
    ad: true,
    msgs: [
      [false, "text", "Info harga dong"],
      [true, "text", "Halo kak Budi, untuk paket mana ya?"],
      [false, "audio", null],
    ],
  },
  {
    name: "Siti Aminah",
    phone: "6281234500003",
    msgs: [
      [false, "text", "Assalamualaikum, alamat kantornya di mana ya?"],
      [true, "text", "Waalaikumsalam kak, di Jl. Kaliurang km 5, Yogyakarta."],
    ],
  },
  {
    name: "Dewi",
    phone: "6281234500004",
    ad: true,
    msgs: [[false, "video", null]],
  },
];

const now = Date.now();
for (const [i, s] of samples.entries()) {
  const start = new Date(now - (samples.length - i) * 3600_000);
  const jid = `${s.phone}@s.whatsapp.net`;
  await db.delete(schema.leads).where(eq(schema.leads.contactJid, jid));
  const [lead] = await db
    .insert(schema.leads)
    .values({
      waAccountId: acc.id,
      contactJid: jid,
      phone: s.phone,
      name: s.name,
      ctwaClid: s.ad ? `dev-clid-${i}` : null,
      adSourceId: s.ad ? "120210000000000" : null,
      adSourceType: s.ad ? "ad" : null,
      adSourceUrl: s.ad ? "https://fb.me/dev" : null,
      adHeadline: s.ad ? "Kelas Digital Marketing Batch 12" : null,
      firstMessageAt: start,
      lastMessageAt: new Date(start.getTime() + s.msgs.length * 60_000),
      lastMessagePreview: s.msgs.at(-1)![2] ?? `[${s.msgs.at(-1)![1]}]`,
      msgInCount: s.msgs.filter((m) => !m[0]).length,
      msgOutCount: s.msgs.filter((m) => m[0]).length,
    })
    .returning();
  await db.insert(schema.messages).values(
    s.msgs.map(([fromMe, type, text], j) => ({
      waAccountId: acc.id,
      leadId: lead.id,
      waMessageId: `dev-${i}-${j}`,
      fromMe,
      type,
      text,
      sentAt: new Date(start.getTime() + (j + 1) * 60_000),
    })),
  );
}
console.log(`seeded ${samples.length} leads for ${email}`);
await sql.end();
