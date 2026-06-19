# Megy Prints — SaaS Docker Architecture

## 3-Tier Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        INTERNET                              │
└──────────────────────────┬──────────────────────────────────┘
                           │
                    ┌──────┴──────┐
                    │   :80/:443  │
                    │   Nginx     │  ← Reverse Proxy + SSL
                    │  (gateway)  │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
        ┌─────┴─────┐ ┌────┴────┐ ┌────┴────┐
        │  Frontend  │ │ Backend │ │   DB    │
        │   :3000    │ │  :4000  │ │  :5432  │
        │  (React)   │ │(Express)│ │(PostgreSQL)
        └────────────┘ └─────────┘ └─────────┘
                                    ┌─────────┐
                                    │  Redis  │
                                    │  :6379  │
                                    │ (cache) │
                                    └─────────┘
```

## Services

| Service | Image | Port | Purpose |
|---------|-------|------|---------|
| `nginx` | nginx:alpine | 80, 443 | Reverse proxy, SSL, static caching |
| `frontend` | Node → Nginx | 80 | React app (built + served) |
| `backend` | Node:20-alpine | 4000 | Express API (auth, orders, admin) |
| `postgres` | postgres:16-alpine | 5432 | User data, albums, orders |
| `redis` | redis:7-alpine | 6379 | Sessions, cache, rate limiting |

## Project Structure

```
Megyprints/
├── docker-compose.yml          # Orchestrates all 5 services
├── nginx/
│   └── nginx.conf              # Reverse proxy routing
├── frontend/
│   ├── Dockerfile              # Multi-stage: build → serve
│   ├── nginx.conf              # SPA routing for built app
│   └── (your React source)
├── backend/
│   ├── Dockerfile              # Node.js API
│   ├── package.json
│   ├── server.js               # Express entry point
│   └── routes/                 # API routes (Sprint 1+)
│       ├── auth.js
│       ├── albums.js
│       ├── orders.js
│       └── admin.js
└── .env                        # Environment variables
```

## Quick Start

### 1. Place Docker files in your project
```bash
# From your repo root:
copy docker-compose.yml .
mkdir nginx backend frontend

copy nginx.conf nginx/
copy frontend/Dockerfile frontend/
copy frontend/nginx.conf frontend/
copy backend/Dockerfile backend/
copy backend/package.json backend/
copy backend/server.js backend/
mkdir backend/routes
```

### 2. Copy your frontend source
```bash
# Your React source goes into frontend/
copy -r src frontend/
copy -r public frontend/
copy package.json frontend/
copy vite.config.ts frontend/
copy tsconfig.json frontend/
copy tailwind.config.js frontend/
copy index.html frontend/
```

### 3. Set environment variables
```bash
copy .env.example .env
# Edit .env with your values
```

### 4. Build & Run
```bash
# Build all services
docker-compose up --build -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f

# Open http://localhost
```

### 5. Stop
```bash
docker-compose down

# Stop + remove volumes (DELETES DATA)
docker-compose down -v
```

## Environment Variables (.env)

```env
# Required
JWT_SECRET=your-super-secret-jwt-key-change-this

# Optional (for Supabase integration)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key

# For custom domain
FRONTEND_URL=https://megyprints.com
```

## Database Persistence

PostgreSQL data is stored in a Docker volume:
```bash
# Backup
docker exec megy_postgres pg_dump -U megyuser megyprints > backup.sql

# Restore
docker exec -i megy_postgres psql -U megyuser megyprints < backup.sql
```

## Production Checklist

- [ ] Change `JWT_SECRET` to a strong random string
- [ ] Set up SSL certificates in `nginx/ssl/`
- [ ] Configure `FRONTEND_URL` in .env
- [ ] Enable Supabase env vars when ready
- [ ] Set up automated backups for postgres_data volume
- [ ] Configure log rotation
- [ ] Set up monitoring (Prometheus/Grafana)

## Cost Estimate (VPS)

| Provider | Specs | Monthly Cost |
|----------|-------|-------------|
| DigitalOcean | 2GB RAM, 1vCPU | ~$12 |
| Hetzner | 4GB RAM, 2vCPU | ~€5 (~$5) |
| AWS Lightsail | 2GB RAM, 1vCPU | ~$10 |
| Vercel + Supabase | Serverless | Free tier → ~$20 |

Self-hosted Docker on VPS is **cheapest long-term**. Vercel + Supabase is **easiest to manage**.
