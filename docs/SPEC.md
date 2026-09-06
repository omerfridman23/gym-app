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
- `GET /api/coaches/me` — full coach profile (settings + message templates).
- `PATCH /api/coaches/me` — profile/onboarding update (`name`, `vertical`,
  `default_price_agorot`, `templates`, ...). Setting `vertical` for the first
  time stamps `onboarded_at`.

## Data API (all RLS-scoped via `withCoach`, cookie auth required)

- `GET/POST /api/clients`, `PATCH /api/clients/:id`, `DELETE /api/clients/:id`
  (soft delete — sets `deleted_at`).
- `GET /api/sessions?from&to` — range list. `POST /api/sessions` — create; with
  `repeatWeekly: true` also creates a `session_series` and materializes 12
  weekly instances. `PATCH /api/sessions/:id` — status / paid / attendance /
  cancel-reason / reminder flags (confirming implies `reminder_answered`).
- `GET/POST /api/payments` — `POST` takes optional `sessionIds` and marks those
  sessions `paid` in the same transaction (this is how "סמן כשולם" works, so
  the `client_debt` view stays consistent).
- `GET/POST /api/packages` — list includes computed `remaining`.

### Public token endpoints (no auth)

Serve the client-facing links; lookups run on the privileged connection,
always scoped by an unguessable UUID from the link:

- `GET /api/public/confirm/:token` — session info (client first name, coach
  name, time, location, status) by `confirm_token`.
- `POST /api/public/confirm/:token/answer` — body `{ answer: 'confirm' |
  'decline' }`; sets the session `confirmed` or `cancelled` (reason "ביטל/ה
  דרך הקישור") and marks `reminder_answered`. Ignored once the session has
  ended.
- `GET /api/public/pay/:clientId` — the client's open debt (same rule as the
  coach app: past, unpaid, non-package sessions) with per-session breakdown.
  The pay page displays it; actual charging (PSP) is not integrated — the pay
  button is still a demo.

### Frontend data layer

`DataProvider` (`apps/web/src/lib/data.tsx`) loads the coach's dataset after
login (profile, clients, sessions ±1y/+120d window, packages, payments) and
maps API rows to the UI shapes the screens were built on (`startsAt` UTC ↔
local `date`/`time` strings). Mutations (`addClient`, `addSession`,
`updateSession`, `recordPayment`, `saveSettings`) call the API and update local
state. A confirmed session whose end time has passed is displayed as `done`
(debt accrues) without a DB write.

SMS delivery is behind the `SmsProvider` interface (`SMS_PROVIDER` token).
`createSmsProvider` picks the driver from `SMS_DRIVER` (default: `twilio` in
production, `dev` locally):

- `twilio` — `TwilioSmsProvider`. Credentials come from the `settings` table
  (`twilio.account_sid`, `twilio.api_key`, `twilio.api_secret`,
  `twilio.from_number`), with env as fallback. Auth uses the API key, not the
  account SID, against Twilio's Messages API.
- `019` — `Sms019Provider`. Required env: `SMS_019_USERNAME`, `SMS_019_TOKEN`,
  `SMS_019_SOURCE`.
- `dev` — `DevSmsProvider`, logs the code to the API console.

`settings` is owner-only (no `app_user` grants), like `otp_codes`.

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
- Client messages go out on WhatsApp from the coach (`wa.me`), using that
  coach's template and `{מאמן}` name — not a shared SMS number.
- Cancellation reasons come from `VERTICAL_CONFIG.cancellationReasons`.

## Current status

- ✅ Phase 1: v0 UI ported.
- ✅ Phase 2: schema + RLS + views on Neon dev branch
  (`dev/coach-management-foundation`); SMS OTP auth + onboarding wired
  end-to-end.
- ✅ Phase 3: mock data removed — clients, sessions, payments, packages, and
  settings run against the real API/database (create client & session,
  weekly-recurring series, confirm/cancel, mark paid, debts, reports).
- ✅ Phase 4: public confirm/pay pages run against real tokens
  (`/api/public/*`); WhatsApp templates now embed real
  `/confirm/:token` and `/pay/:clientId` links.
- ⏭ Phase 5+: reminders worker (needs a paid SMS route — WhatsApp links stay
  manual until then), payment provider integration for the pay page, deploy
  migration to Neon main + Railway.
