# ⚡ Quick Deploy — LocalCompliance Production

## Port Map
```
Web: 4580 | API: 4581 | PG: 4582 | Redis: 4583 | MinIO: 4584/4585
```

---

## 1. Server Setup
```bash
# Install Docker (skip kalau sudah ada)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER && newgrp docker
```

## 2. Clone & Config
```bash
cd /opt
git clone <REPO_URL> localcompliance && cd localcompliance
cp .env.production.example .env
nano .env
```

**Isi `.env` wajib:**
```env
POSTGRES_PASSWORD=<random>        # openssl rand -base64 32
REDIS_PASSWORD=<random>
JWT_SECRET=<random-min-32-chars>
MINIO_ROOT_PASSWORD=<random>
CORS_ORIGIN=https://yourdomain.com
PASAL_API_TOKEN=<token>
```

## 3. Cloudflare Tunnel (sudah terpasang di server)

Tambah public hostname di [Zero Trust Dashboard](https://one.dash.cloudflare.com) → Networks → Tunnels → pilih tunnel kamu:

| Hostname | Service |
|----------|---------|
| `yourdomain.com` | `http://localhost:4580` |

> ⚠️ Karena cloudflared jalan di **host** (bukan Docker), target = `localhost:4580`

SSL/TLS → **Full (strict)**

## 4. Deploy
```bash
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d
```

## 5. Migrate & Seed Database
```bash
# Buat tabel dari schema (project ini belum pakai migration files)
docker exec lc-api npx prisma db push

# Main seed (categories, sectors, feature flags)
docker exec lc-api npx prisma db seed

# Compliance rules
docker exec lc-api npx ts-node --compiler-options '{"module":"CommonJS"}' prisma/seed-rules.ts

# Article content
docker exec lc-api npx ts-node --compiler-options '{"module":"CommonJS"}' prisma/seed-articles.ts

# Document templates
docker exec lc-api npx ts-node --compiler-options '{"module":"CommonJS"}' prisma/seed-documents.ts

# CMS data
docker exec lc-api npx ts-node --compiler-options '{"module":"CommonJS"}' prisma/seed-cms.ts
```

> 💡 Semua seed menggunakan `upsert` — aman dijalankan ulang tanpa duplikasi.

## 6. Verify
```bash
# Semua container running?
docker compose -f docker-compose.prod.yml ps

# Web accessible dari host?
curl -s http://localhost:4580

# API reachable internally?
docker exec lc-web wget -qO- http://api:4581/api/v1/health

# Buka browser → https://yourdomain.com ✅
```

---

## Maintenance

```bash
# Logs
docker compose -f docker-compose.prod.yml logs -f [service]

# Restart
docker compose -f docker-compose.prod.yml restart [service]

# Update code
git pull && docker compose -f docker-compose.prod.yml build && docker compose -f docker-compose.prod.yml up -d

# DB Backup
docker exec lc-postgres pg_dump -U postgres -p 4582 localcompliance > backup_$(date +%Y%m%d).sql

# DB Restore
cat backup.sql | docker exec -i lc-postgres psql -U postgres -p 4582 localcompliance
```

## Troubleshooting

| Problem | Fix |
|---------|-----|
| 502/504 error | `docker logs lc-api` — cek API crash |
| Tunnel disconnect | `systemctl status cloudflared` — cek service |
| DB schema/table missing | `docker exec lc-api npx prisma db push` |
| Rebuild bersih | `docker compose -f docker-compose.prod.yml build --no-cache` |

> 📖 Detail lengkap: `docs/DEPLOYMENT.md`
