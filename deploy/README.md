# Deploy CTWA Tracker

> Pakai Dokploy? Biarkan AI yang mengerjakan: lihat [docs/setup-ai.md](../docs/setup-ai.md) mode `dokploy`
> (memakai `deploy/docker-compose.dokploy.yml`, API Dokploy, dan subdomain Cloudflare).
> Panduan di bawah ini untuk VPS polos dengan Docker saja.

Cara paling sederhana: satu VPS (Ubuntu, RAM ≥ 1 GB) dengan Docker. Semua jalan lewat `deploy/docker-compose.yml`:
Postgres, app (API + web), dan WhatsApp engine.

## 1. Siapkan `.env`

Di root repo (VPS), buat file `.env` berisi secret acak:

```bash
echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)" > .env
echo "APP_URL=https://ctwa.domainanda.com" >> .env
echo "BETTER_AUTH_SECRET=$(openssl rand -hex 32)" >> .env
echo "ENCRYPTION_KEY=$(openssl rand -hex 32)" >> .env
echo "INTERNAL_TOKEN=$(openssl rand -hex 24)" >> .env
```

Ganti `APP_URL` dengan domain Anda. Simpan salinan `.env` di tempat aman.
**`ENCRYPTION_KEY` tidak boleh diganti** setelah ada data, karena access token pixel yang tersimpan tidak bisa dibuka lagi.

## 2. Jalankan

```bash
docker compose -f deploy/docker-compose.yml --env-file .env up -d --build
```

Migrasi database jalan otomatis setiap container `app` start. App terbuka di port `3000`.

## 3. Domain + HTTPS

Arahkan DNS domain ke IP VPS, lalu pasang reverse proxy ke `localhost:3000`. Contoh Caddy (`/etc/caddy/Caddyfile`):

```
ctwa.domainanda.com {
    reverse_proxy localhost:3000
}
```

`APP_URL` di `.env` harus sama persis dengan domain yang dipakai (termasuk `https://`).
Kalau memakai Dokploy / Coolify, cukup arahkan domain ke service `app` port 3000.

## 4. Akun admin

Daftar di `https://ctwa.domainanda.com/register`. User pertama otomatis menjadi admin.
Admin tambahan:

```bash
docker compose -f deploy/docker-compose.yml exec app bun src/db/make-admin.ts email@lain.com
```

Panel admin: `https://ctwa.domainanda.com/panel`.

## 5. Update ke versi terbaru

```bash
git pull
docker compose -f deploy/docker-compose.yml --env-file .env up -d --build
```

## 6. Pemakaian RAM (idle)

| Container | RAM |
|---|---|
| engine (0 sesi) | ~8 MB, bertambah beberapa MB per nomor terhubung |
| app | ~80 MB |

Batas `mem_limit` 256 MB per container; engine juga dibatasi `GOMEMLIMIT` (default 200MiB).
Kalau nomor yang terhubung banyak, naikkan `ENGINE_GOMEMLIMIT` di `.env` dan `mem_limit` engine di compose.
Pantau di Panel → Users (kartu "RAM engine").

## Checklist setelah deploy

- [ ] Daftar akun & jadikan admin
- [ ] Hubungkan 1 nomor uji via QR (WA Accounts)
- [ ] Tambah Pixel dengan **test event code**, klik "Test kirim ke Meta", lalu cek di Events Manager → Test Events
- [ ] Klik iklan CTWA dari HP lain, lalu pastikan lead tampil dengan badge "Iklan" & "CTWA Click ID: Terekam"
- [ ] Buat Trigger, kirim kata kunci, cek tag Potential / CAPI Sent
- [ ] Kosongkan test event code di Pixel setelah uji selesai
