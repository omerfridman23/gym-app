# Coach Management App — SPEC

Derived from the v0 UI prototype + Developer Handoff. This document is the
source of truth for the data model and business rules. Update it whenever
either changes.

## Stack

| Layer      | Technology                                              |
| ---------- | ------------------------------------------------------- |
| Frontend   | Vite + React 19 + TypeScript, Tailwind CSS 4, react-router |
| Backend    | NestJS 12 (ESM), Prisma 7 (`@prisma/adapter-pg`)         |
| Database   | Neon Postgres (dev branches per feature)                 |
| Deployment | Railway (web + api services)                             |

The UI code was ported from a Next.js v0 prototype. `next/link` and
`next/navigation` are aliased to react-router shims (`apps/web/src/shims/`) so
future v0 syncs need minimal edits.

## Core invariants (from the handoff)

1. **Design tokens only** — no hardcoded colors/sizes; tokens live in
   `apps/web/src/index.css` (`@theme`).
2. **`VERTICAL_CONFIG`** (`apps/web/src/lib/vertical-config.ts`) is the single
   place where padel and fitness differ: terms, session types, client fields,
   cancellation reasons. Never write `if (vertical === 'padel')` in components —
   add a config field instead.
3. **RTL** — logical properties only (`ps-`, `pe-`, `ms-`, `me-`, `text-start`).
4. **Money** is stored as integer agorot (`price_agorot`, `amount_agorot`).
   Display as ₪ whole shekels.
5. **Dates** stored UTC (`timestamptz`), displayed in `Asia/Jerusalem`.
6. **No hard deletes** — `deleted_at` everywhere; the DB role has no DELETE
   grant, so hard deletes are impossible at the DB level.
7. **Debt and package balance are calculated, never stored** — views
   `client_debt` and `package_balance`.

## Database

Schema: `apps/api/prisma/schema.prisma`. RLS, the `app_user` role, and the
views live as SQL inside the migration files (Prisma cannot express them).

### Tables

- **coaches** — one row per coach (the tenant). `phone` unique (E.164),
  `vertical` (`padel`/`fitness`, null until onboarding), `default_price_agorot`,
  `reminder_hours_before`, `cancellation_policy`, `templates` (JSONB, WhatsApp
  message templates), `onboarded_at`.
- **clients** — belongs to a coach. `fields` JSONB holds vertical-specific
  attributes keyed by `VERTICAL_CONFIG.clientFields` (padel: level/side;
  fitness: goal/notes). `price_agorot` is the per-client session price.
- **session_series** — recurring template (weekday 0=Sunday, `time_local`
  "HH:MM" in Asia/Jerusalem, duration, price). Sessions generated from a series
  point back via `series_id`.
- **sessions** — a concrete training. `starts_at` timestamptz, `status`
  (`pending`/`confirmed`/`cancelled`/`done`), `paid` flag, `package_id` when
  the session consumes a package (then `price_agorot` = 0), `attendance`
  (`arrived`/`no_show`), `cancel_reason`, reminder flags, and a unique
  `confirm_token` for the public confirmation link (expires with the session
  via `confirm_expires_at`).
- **packages** — client punch cards: `total_sessions`, `purchased_agorot`.
- **payments** — money received: `amount_agorot`, `method`
  (`cash`/`bit`/`transfer`/`card`), `paid_at`.
- **otp_codes** — pre-auth: `phone`, `code_hash` (sha256 of phone:code),
  `attempts`, `expires_at`, `consumed_at`. Owner-only (RLS deny-all, no grants).

### Views

- **client_debt** — per client: `debt_agorot` = Σ price of `done`, non-package,
  chargeable, non-deleted sessions − Σ payments; plus `unpaid_sessions` count
  and `last_unpaid_at` (based on the `paid` flag) for the UI.
- **package_balance** — per package: `remaining_sessions` = `total_sessions` −
  non-cancelled, non-deleted sessions linked to it.

Both are `security_invoker` so they respect the caller's RLS.

### Security model

Two DB roles / two Prisma clients:

| Role           | Used by                              | Powers                                                     |
| -------------- | ------------------------------------ | ---------------------------------------------------------- |
| `neondb_owner` | migrations, `PrismaAdminService`     | full; bypasses RLS (table owner). Auth flows only.         |
| `app_user`     | `PrismaService` (all business logic) | SELECT/INSERT/UPDATE only; RLS-scoped to one coach.        |

- Every table has RLS enabled with policies matching
  `current_setting('app.coach_id', true)::uuid`; unset context = deny all.
- `PrismaService.withCoach(coachId, fn)` wraps `fn` in a transaction that runs
  `set_config('app.coach_id', ..., true)` first. All authenticated data access
  must go through it.
- `app_user` is created by the initial migration via SQL (a Neon console role
  would get `neon_superuser` + BYPASSRLS, defeating RLS). Login + password are
  granted per-branch by `apps/api/scripts/setup-app-user.mjs`.
- Smoke test: `npm run db:rls-test -w apps/api` (isolation, WITH CHECK,
  no-DELETE, otp lockout, view scoping).

### Env vars (root `.env.local`, gitignored)

- `DATABASE_URL` — runtime, `app_user`, pooled.
- `DATABASE_URL_UNPOOLED` — migrations + admin client, owner, direct.
- `JWT_SECRET` — session token signing.
- `NEON_BRANCH` — informational, which Neon branch the URLs point at.

### Workflows

- New migration: `npm run db:migrate -w apps/api` (uses direct URL; add
  hand-written SQL with `--create-only` first when RLS/views change).
- New Neon branch: create branch → `db:deploy` → `db:setup-app-user` → put the
  printed app_user URL in `DATABASE_URL`.

## Authentication

SMS OTP → JWT in an httpOnly cookie (`coach_session`, 30 days).

- `POST /api/auth/otp/request` `{phone}` — normalizes `05XXXXXXXX` /
  `+9725XXXXXXXX` to E.164; 6-digit code, 10 min TTL; a new code supersedes the
  previous one. Rate limit: 3 requests per phone per 15 min (429).
- `POST /api/auth/otp/verify` `{phone, code}` — max 5 wrong attempts per code;
  on success consumes the code, upserts the coach by phone, sets the cookie,
  returns the coach session.
- `GET /api/auth/me` — session probe (RLS-scoped read).
- `POST /api/auth/logout` — clears the cookie.
- `PATCH /api/coaches/me` — profile/onboarding update (`name`, `vertical`,
  `default_price_agorot`, ...). Setting `vertical` for the first time stamps
  `onboarded_at`.

SMS delivery is behind the `SmsProvider` interface (`SMS_PROVIDER` token).
`DevSmsProvider` logs the code to the API console; the real provider (Twilio /
019 / ...) is an open product decision — implement the interface and rebind in
`AuthModule`.

Cookie: `SameSite=Lax` in dev (localhost ports are same-site), `SameSite=None;
Secure` in production (web and api are different Railway domains).

### Frontend gating

`AuthProvider` (`apps/web/src/lib/auth-context.tsx`) loads `/auth/me` on boot.
Route guards in `App.tsx`:

- `/login` — public; redirects authed coaches to `/` (or `/onboarding`).
- `/onboarding` — requires session; vertical selection + name/price, persists
  via `PATCH /coaches/me`.
- App routes (`/`, `/calendar`, `/clients`, ...) — require session +
  completed onboarding.
- `/confirm/:id`, `/pay/:id` — public (client-facing token links).

The coach's stored `vertical` is synced into `VerticalProvider` on login.

## Business rules (from the UI, to implement in phases 3+)

- Session statuses: `pending` → (`confirmed` | `cancelled`) → `done`;
  attendance recorded on done sessions.
- A session covered by a package consumes one punch and charges 0.
- Reminder: send `reminder_hours_before` hours before `starts_at`; the client
  confirms via the public `confirm_token` link.
- WhatsApp messages are prefilled links (`wa.me`) generated client-side from
  `templates` — no WhatsApp API integration.
- Cancellation reasons come from `VERTICAL_CONFIG.cancellationReasons`.

## Current status

- ✅ Phase 1: v0 UI ported (mock data still drives all app screens).
- ✅ Phase 2: schema + RLS + views on Neon dev branch
  (`dev/coach-management-foundation`); SMS OTP auth + onboarding wired
  end-to-end.
- ⏭ Phase 3+: replace mock data with real API modules (clients, sessions,
  payments, packages), reminders worker, public confirm/pay pages against real
  tokens.
