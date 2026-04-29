# 🚀 LocalCompliance — Production Deployment Guide

## Port Mapping (Non-Standard)

| Service        | Port  | Exposed to Host? |
|----------------|-------|------------------|
| Web (FE)       | 4580  | ✅ Yes (Cloudflare Tunnel connects here) |
| API            | 4581  | ❌ Internal only |
| PostgreSQL     | 4582  | ❌ Internal only |
| Redis          | 4583  | ❌ Internal only |
| MinIO API      | 4584  | ❌ Internal only |
| MinIO Console  | 4585  | ❌ Internal only |

## Arsitektur Deployment

```
Internet
   │
   ▼
Cloudflare Tunnel (cloudflared container)
   │
   ▼ (internal Docker network)
┌──────────────────────────────────────────────────┐
│  Docker Network: internal                         │
│                                                   │
│  ┌─────────┐    rewrites      ┌──────────┐      │
│  │  web     │ ───────────────→│  api     │      │
│  │  :4580   │  /api/v1/*      │  :4581   │      │
│  └─────────┘                  └──────────┘      │
│       ▲                         │  │  │          │
│       │                         ▼  ▼  ▼          │
│  Cloudflare               ┌────┐┌────┐┌─────┐  │
│  Tunnel                   │ PG ││Red ││MinIO│  │
│  connects                 │4582││4583││4584 │  │
│  here                     └────┘└────┘└─────┘  │
└──────────────────────────────────────────────────┘
```

**Key Point:** Hanya `web:4580` yang di-expose ke host. Semua service lain **internal only**.

---

## Step 1: Persiapan Server (Proxmox VM/LXC)

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Install Docker Compose plugin
sudo apt install docker-compose-plugin -y

# Verify
docker --version
docker compose version
```

---

## Step 2: Setup Cloudflare Tunnel

### 2a. Di Cloudflare Dashboard

1. Buka [Cloudflare Zero Trust](https://one.dash.cloudflare.com)
2. Navigasi ke **Networks → Tunnels**
3. Klik **Create a tunnel**
4. Pilih **Cloudflared** connector
5. Beri nama tunnel: `localcompliance-prod`
6. **Copy TUNNEL_TOKEN** yang diberikan

### 2b. Konfigurasi Public Hostname

Di halaman tunnel config, tambahkan:

| Public hostname       | Service             |
|-----------------------|---------------------|
| `yourdomain.com`      | `http://web:4580`   |
| `www.yourdomain.com`  | `http://web:4580`   |

> ⚠️ **JANGAN** tambahkan route untuk API. API diakses melalui Next.js rewrites proxy.

### 2c. SSL/TLS Settings

Di Cloudflare Dashboard → SSL/TLS:
- Mode: **Full (strict)** — recommended
- Atau minimal: **Full**

---

## Step 3: Deploy ke Server

### 3a. Clone Repository

```bash
cd /opt
git clone https://github.com/your-repo/ai-legal.git localcompliance
cd localcompliance
```

### 3b. Setup Environment

```bash
# Copy template
cp .env.production.example .env

# Edit dengan nilai production
nano .env
```

**Wajib diisi:**
```env
POSTGRES_PASSWORD=<strong-random-password>
REDIS_PASSWORD=<strong-random-password>
JWT_SECRET=<min-32-chars-random-string>
MINIO_ROOT_PASSWORD=<strong-random-password>
CORS_ORIGIN=https://yourdomain.com
CLOUDFLARE_TUNNEL_TOKEN=<token-dari-step-2>
PASAL_API_TOKEN=<your-pasal-token>
```

Generate random passwords:
```bash
openssl rand -base64 32  # Jalankan untuk setiap password
```

### 3c. Build & Start

```bash
# Build images
docker compose -f docker-compose.prod.yml build

# Start semua services
docker compose -f docker-compose.prod.yml up -d

# Cek status
docker compose -f docker-compose.prod.yml ps

# Cek logs
docker compose -f docker-compose.prod.yml logs -f
```

### 3d. Verify

```bash
# Cek semua container running
docker ps

# Cek tunnel connected
docker logs lc-cloudflared

# Test internal API dari web container
docker exec lc-web wget -qO- http://api:4581/api/v1/health

# Test dari browser
# Buka https://yourdomain.com
```

---

## Step 4: Ollama (AI Model)

Jika kamu menjalankan Ollama di host Proxmox (bukan di Docker):

```bash
# Install Ollama di host
curl -fsSL https://ollama.com/install.sh | sh

# Pull model
ollama pull qwen2.5

# Pastikan Ollama listen di semua interface
# Edit /etc/systemd/system/ollama.service
# Tambahkan: Environment="OLLAMA_HOST=0.0.0.0"
sudo systemctl daemon-reload
sudo systemctl restart ollama
```

Di `.env`, set:
```env
OLLAMA_BASE_URL=http://host.docker.internal:11434
```

> Jika `host.docker.internal` tidak resolve (Linux), tambahkan di docker-compose.prod.yml pada service `api`:
> ```yaml
> extra_hosts:
>   - "host.docker.internal:host-gateway"
> ```

---

## Troubleshooting

### API calls return 502/504
```bash
# Cek API container running
docker logs lc-api

# Cek internal connectivity
docker exec lc-web wget -qO- http://api:4581/api/v1/health
```

### Tunnel not connecting
```bash
# Cek cloudflared logs
docker logs lc-cloudflared

# Verify token
echo $CLOUDFLARE_TUNNEL_TOKEN | head -c 20
```

### Database migration failed
```bash
# Manual migration
docker exec lc-api npx prisma migrate deploy

# Reset (⚠️ DESTROYS DATA)
docker exec lc-api npx prisma migrate reset --force
```

### Rebuild after code changes
```bash
docker compose -f docker-compose.prod.yml build --no-cache
docker compose -f docker-compose.prod.yml up -d
```

---

## Security Checklist

- [ ] Semua password di `.env` sudah diganti dari default
- [ ] JWT_SECRET minimal 32 karakter random
- [ ] Hanya port 4580 yang exposed ke host (dan itu pun via Cloudflare Tunnel)
- [ ] Cloudflare SSL mode = Full (strict)
- [ ] Firewall server: block semua port kecuali yang diperlukan Cloudflare
- [ ] `.env` file TIDAK di-commit ke git
- [ ] Backup strategy untuk PostgreSQL volume
- [ ] Rate limiting aktif di Cloudflare

---

## Backup & Maintenance

### Database Backup
```bash
# Backup (note: internal port 4582)
docker exec lc-postgres pg_dump -U postgres -p 4582 localcompliance > backup_$(date +%Y%m%d).sql

# Restore
cat backup_20260429.sql | docker exec -i lc-postgres psql -U postgres -p 4582 localcompliance
```

### Update Deployment
```bash
cd /opt/localcompliance
git pull origin main
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d
```
