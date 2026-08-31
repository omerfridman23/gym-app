# Gym App — Coach Marketplace (POC)

RTL Hebrew marketplace connecting customers with independent personal coaches.

## Stack

| Layer | Technology | Deploy target |
| --- | --- | --- |
| Frontend | React 19 + Vite + TypeScript | Railway service |
| Backend | NestJS 12 (controller → service → repository, DI) | Railway service |
| Database | Neon Postgres (`pg` driver) | Neon |

## Structure

```
apps/
  api/                     NestJS backend
    src/
      database/            Pool provider (global module, DI token PG_POOL)
      health/              Health check: controller → service → repository
  web/                     React frontend (RTL Hebrew)
    src/
      lib/api.ts           API client
neon.ts                    Neon config policy
```

## Database

| Property | Value |
| --- | --- |
| Neon project | `gym-app` (`small-paper-30379472`) |
| Region | `aws-eu-central-1` (Frankfurt) — closest available to Israel |
| Branch | `main` |
| Postgres | 18 |

## Local setup

Environment variables live in `.env.local` at the repo root, populated by `neon deploy`.
The API reads it through `ConfigModule` (`envFilePath: ['.env', '../../.env.local']`).

```bash
# Backend — http://localhost:3000
cd apps/api
npm run start:dev

# Frontend — http://localhost:5173
cd apps/web
npm run dev
```

Copy `apps/web/.env.example` to `apps/web/.env` if the API is not on `localhost:3000`.

## Health check

`GET /api/health`

```json
{
  "status": "ok",
  "service": "gym-app-api",
  "timestamp": "2026-08-31T19:00:00.000Z",
  "database": { "reachable": true, "latencyMs": 42 }
}
```

`status` is `degraded` when the database is unreachable. The endpoint still returns HTTP 200
so Railway health checks distinguish "process is up" from "database is down".

## Railway deployment

Two services from one repo:

| Service | Root directory | Build | Start | Health check |
| --- | --- | --- | --- | --- |
| api | `apps/api` | `npm ci && npm run build` | `npm run start:prod` | `/api/health` |
| web | `apps/web` | `npm ci && npm run build` | serve `dist/` | `/` |

Required environment variables:

- **api**: `DATABASE_URL` (Neon pooled), `WEB_ORIGIN` (frontend URL), `PORT` (Railway provides it)
- **web**: `VITE_API_URL` (API URL, build-time)

## Conventions

- Every relative import in the API uses an explicit `.js` extension (ESM + `nodenext`).
- Runtime queries use the Neon **pooled** URL; migrations use `DATABASE_URL_UNPOOLED`.
- Session timestamps must be stored as `timestamptz` (Israel observes DST).
