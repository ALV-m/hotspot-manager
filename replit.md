# FastNet Hotspot Portal

A WiFi hotspot captive portal system for Kenyan hotspot operators. Users connecting to the access point see a portal to buy internet packages and pay via M-Pesa STK Push (PayHero). Admins manage packages and monitor paid/unpaid sessions from a dashboard.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/hotspot-portal run dev` — run the captive portal frontend
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)

## Required Environment Secrets

- `DATABASE_URL` — Postgres connection string (auto-set by Replit DB)
- `PAYHERO_AUTH` — Full Basic auth header value, e.g. `Basic <base64token>`
- `PAYHERO_CHANNEL_ID` — PayHero channel ID (e.g. `9344`)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + Tailwind CSS + TanStack Query
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Payments: PayHero M-Pesa STK Push
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — API contract (source of truth)
- `lib/db/src/schema/packages.ts` — packages table
- `lib/db/src/schema/sessions.ts` — sessions table (pending/paid/expired)
- `artifacts/api-server/src/routes/packages.ts` — packages CRUD
- `artifacts/api-server/src/routes/sessions.ts` — sessions + stats
- `artifacts/api-server/src/routes/payments.ts` — PayHero STK push + callback + status poll
- `artifacts/hotspot-portal/src/` — React frontend (captive portal + admin dashboard)

## Architecture decisions

- PayHero callback URL uses `REPLIT_DOMAINS` env var to auto-detect the public domain
- Phone numbers are normalized to `254XXXXXXXXX` format before sending to PayHero
- Sessions start as `pending`, move to `paid` on successful callback, `expired` when time runs out
- `PAYHERO_AUTH` stores the full `Basic <token>` string directly — no username/password splitting
- Admin dashboard at `/admin` requires no authentication (keep access controlled at network level)

## Product

- **Captive portal (`/`)** — shows packages, lets user pick one, enter phone, triggers M-Pesa STK Push, polls for payment confirmation
- **Admin dashboard (`/admin`)** — session stats, live sessions table with paid/pending/expired status, full package CRUD

## Gotchas

- PayHero API URL must include `?is_active=true` — omitting it causes auth errors
- PayHero `PAYHERO_AUTH` is already the full `Basic <base64>` string, do NOT prepend `Basic` again
- After any schema change, run `pnpm --filter @workspace/db run push` then restart the API workflow
- After any OpenAPI spec change, run `pnpm --filter @workspace/api-spec run codegen` before using updated types

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
