# CTWA Tracker: catatan untuk AI assistant

- Aplikasi self-host pelacak lead Click-to-WhatsApp → Meta Conversions API. Struktur & perintah dev: lihat `README.md`.
- **Diminta memasang / setup / install aplikasi ini?** Ikuti `docs/setup-ai.md` langkah demi langkah.
- Setelah mengubah `apps/api/src/db/schema.ts`: `bun run db:generate` lalu `bun run db:migrate`.
- Sebelum selesai: `bun run typecheck` dan `bun run test` (API), `go test ./...` (folder `engine`).
- Jangan pernah commit `.env`, `.env.setup`, atau `.env.production.local`, dan jangan menampilkan isinya.
