# Setup CTWA Tracker oleh AI

Dokumen ini ditulis untuk **AI coding assistant** (Claude Code, Copilot agent, Cursor, dll) yang diminta
memasang CTWA Tracker untuk pengguna. Pengguna cukup mengisi `.env.setup`, lalu memberi prompt.
Di akhir, pengguna tinggal membuka URL aplikasi dan login.

## Aturan untuk AI

- Baca `.env.setup` di root repo. Kalau belum ada: salin `.env.setup.example` menjadi `.env.setup`,
  minta pengguna mengisinya, lalu berhenti sampai pengguna bilang sudah diisi.
- Ikuti `SETUP_MODE`: `local` → bagian A, `dokploy` → bagian B.
- **Jangan pernah menampilkan** isi token, password, atau secret di chat/log. Sebut nama variabelnya saja.
- Jangan commit `.env`, `.env.setup`, atau `.env.production.local` (semuanya sudah di-ignore).
- Semua langkah harus aman diulang: kalau sesuatu sudah ada (container, project, record DNS, akun), pakai yang ada.
- Jelaskan ke pengguna, dalam bahasa Indonesia yang sederhana, apa yang sedang dikerjakan di tiap langkah.
- Kalau sebuah langkah butuh tindakan pengguna (instal yang perlu izin admin, restart, membuka aplikasi),
  minta dengan jelas lalu tunggu.
- Secret acak = hex dari sumber kriptografis: `openssl rand -hex 32`, atau di PowerShell
  `$b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); -join ($b | ForEach-Object { '{0:x2}' -f $_ })`
  bila openssl tidak ada.

## A. Mode `local` (laptop/desktop)

Semua komponen (Postgres, app, WhatsApp engine) jalan di Docker. Tidak perlu Bun atau Go.

1. **Cek Docker.** Jalankan `docker info`.
   - Belum terpasang → pasang Docker Desktop:
     Windows `winget install -e --id Docker.DockerDesktop`, macOS `brew install --cask docker`,
     Linux `curl -fsSL https://get.docker.com | sh`.
   - Minta pengguna membuka Docker Desktop sampai statusnya "running" (Windows bisa meminta WSL2 dan restart).
     Ulangi `docker info` sampai berhasil.
2. **Buat `.env`** di root repo bila belum ada (jangan timpa yang sudah ada, karena `ENCRYPTION_KEY` tidak boleh berubah):
   ```
   POSTGRES_PASSWORD=<hex 24 byte>
   APP_PORT=3000
   APP_URL=http://localhost:3000
   BETTER_AUTH_SECRET=<hex 32 byte>
   ENCRYPTION_KEY=<hex 32 byte>
   INTERNAL_TOKEN=<hex 24 byte>
   ```
   Kalau port 3000 sudah dipakai, pilih port lain (3001, 3002, ...) dan samakan `APP_PORT` dengan port di `APP_URL`.
3. **Jalankan:**
   `docker compose -p ctwa-tracker -f deploy/docker-compose.yml --env-file .env up -d --build`
   (build pertama 3–10 menit).
4. **Tunggu sehat:** `GET http://localhost:<APP_PORT>/api/health` harus `{"ok":true}`.
   Kalau gagal, lihat `docker compose -p ctwa-tracker -f deploy/docker-compose.yml --env-file .env logs app engine`.
5. **Buat akun admin** (lihat bagian C) dengan `BASE=http://localhost:<APP_PORT>`.
6. **Laporan ke pengguna:** URL aplikasi, email login, dan cara menyalakan ulang:
   buka Docker Desktop; container `ctwa-tracker` otomatis hidup lagi (`restart: unless-stopped`).

Update versi: `git pull` lalu ulangi langkah 3.

## B. Mode `dokploy` (VPS + Dokploy)

Variabel wajib di `.env.setup`: `DOKPLOY_URL`, `DOKPLOY_API_KEY`, `APP_DOMAIN`, `VPS_IP`,
`GIT_REPO_URL`, `GIT_BRANCH`, dan data admin.
Record DNS (A record `APP_DOMAIN` → `VPS_IP`) dibuat **manual oleh pengguna** di Cloudflare; AI hanya mengecek.

### B1. Cek akses

- Dokploy: `GET {DOKPLOY_URL}/api/project.all` dengan header `x-api-key: {DOKPLOY_API_KEY}` → harus 200.
  401/403 → minta pengguna membuat ulang API key di Dokploy → Settings → Profile → API/CLI.
- Referensi lengkap API Dokploy: `{DOKPLOY_URL}/swagger` dan https://docs.dokploy.com/docs/api.
  Kalau bentuk respons berbeda dari dugaan, baca Swagger, jangan menebak.

### B2. Cek DNS (dibuat manual oleh pengguna)

- Jalankan `nslookup {APP_DOMAIN} 1.1.1.1`. Hasilnya harus `VPS_IP`.
- Belum cocok → minta pengguna, dengan bahasa awam: buka Cloudflare → pilih domain → DNS → Records →
  Add record → Type `A`, Name = bagian depan subdomain (mis. `ctwa`), IPv4 address = `VPS_IP`,
  Proxy status **mati** (awan abu-abu / DNS only) → Save. Tunggu 1–5 menit, cek lagi.
- Kalau hasilnya IP Cloudflare (record masih Proxied), minta pengguna mematikan proxy dulu supaya sertifikat
  Let's Encrypt bisa terbit. Lanjut ke langkah berikutnya hanya setelah DNS cocok.

### B3. Secret produksi

Bila `.env.production.local` belum ada, buat dengan `POSTGRES_PASSWORD`, `BETTER_AUTH_SECRET`, `ENCRYPTION_KEY`,
`INTERNAL_TOKEN` acak (format seperti mode local). Kalau sudah ada, pakai isinya; jangan buat ulang.
Ingatkan pengguna menyimpan file ini di password manager.

### B4. Project dan compose di Dokploy (semua `POST` JSON, header `x-api-key`)

1. **Project:** cari project bernama `CTWA Tracker` di `project.all`; kalau tidak ada,
   `project.create {"name":"CTWA Tracker"}`, lalu ambil lagi lewat `project.all`.
2. **Environment:** ambil `environmentId` dari data project (environment `production`), atau lewat
   `GET environment.byProjectId?projectId=...`. Kalau kosong, `environment.create {"name":"production","projectId":...}`.
3. **Compose:** cari compose bernama `ctwa-tracker` di environment itu; kalau tidak ada,
   `compose.create {"name":"ctwa-tracker","environmentId":...,"composeType":"docker-compose"}`.
   Ambil `composeId` dari respons atau dari data project.
4. **Sumber & env:** `compose.update` dengan:
   ```json
   {
     "composeId": "...",
     "sourceType": "git",
     "customGitUrl": "{GIT_REPO_URL}",
     "customGitBranch": "{GIT_BRANCH}",
     "composePath": "./deploy/docker-compose.dokploy.yml",
     "env": "POSTGRES_PASSWORD=...\nAPP_URL=https://{APP_DOMAIN}\nBETTER_AUTH_SECRET=...\nENCRYPTION_KEY=...\nINTERNAL_TOKEN=..."
   }
   ```
   Repo **private**: buat SSH key di Dokploy (bagian `sshKey` di Swagger), pasang public key-nya sebagai
   deploy key read-only di GitHub (`gh repo deploy-key add`), lalu pakai URL `git@github.com:<owner>/<repo>.git`
   dan isi `customGitSSHKeyId`.
5. **Domain:** kalau `GET domain.byComposeId?composeId=...` belum memuat `APP_DOMAIN`, buat:
   `domain.create {"host":"{APP_DOMAIN}","port":3000,"serviceName":"app","https":true,"certificateType":"letsencrypt","composeId":"...","domainType":"compose"}`.
6. **Deploy:** `compose.deploy {"composeId":"..."}`. Build pertama 5–15 menit.
   Pantau status di `compose.one?composeId=...` (atau minta pengguna melihat tab Deployments di Dokploy).

### B5. Verifikasi

- Tunggu `GET https://{APP_DOMAIN}/api/health` → `{"ok":true}`. Sertifikat bisa butuh beberapa menit setelah
  deploy selesai. Masih gagal setelah ~10 menit → cek DNS (`nslookup {APP_DOMAIN}` harus `VPS_IP`),
  port 80/443 terbuka di firewall VPS, dan log deploy di Dokploy.
- Buat akun admin (bagian C) dengan `BASE=https://{APP_DOMAIN}`.
- Laporkan: URL aplikasi, email login, nama project di Dokploy.

Update versi: `compose.deploy` lagi (atau tombol Deploy di Dokploy).

## C. Membuat akun admin

User **pertama** yang mendaftar otomatis menjadi admin.

```
POST {BASE}/api/auth/sign-up/email
Content-Type: application/json
Origin: {BASE}

{"name":"{ADMIN_NAME}","email":"{ADMIN_EMAIL}","password":"{ADMIN_PASSWORD}"}
```

- 200 → akun dibuat.
- Error "user already exists" → akun sudah ada; lanjut.
- Lalu uji login: `POST {BASE}/api/auth/sign-in/email` dengan email & password yang sama → 200.
- `ADMIN_PASSWORD` minimal 8 karakter. Jangan tampilkan password di laporan.
