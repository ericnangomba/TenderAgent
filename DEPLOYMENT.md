# TenderAgent deployment (home VM, Coolify)

Target: a private VM running Coolify (Docker), bound to the private
overlay-network interface only - no public domain or TLS termination on this
service. Netlify remains the static preview; the account/subscription backend
runs here.

## Data: Neon Postgres (free plan, project `tenderagent`)

1. Neon console -> project `tenderagent` -> Connection Details -> copy the
   pooled connection string (it carries `sslmode=require`).
2. Store it in the password vault; paste it into Coolify as `DATABASE_URL`.
   The empty schema is created automatically on first boot (idempotent).

## Coolify service

- Source: this repo, branch `main` (after merge), build pack: Dockerfile.
- Port: 3001. Bind to the private network interface only.
- Environment:
  - `NODE_ENV=production`
  - `STORE=postgres`
  - `DATABASE_URL=<from vault>`
  - `AUTH_REQUIRED=true`
  - `MOCK_BILLING_SECRET=<vault random>` (mock provider until a real billing
    provider is integrated - no real charges exist yet)
  - `TRUST_PROXY=` leave unset until a known proxy terminates in front
  - `PGSSL=` leave unset (certificate verification stays ON); `disable` is
    only for a local dev database with no TLS
  - Do NOT set `ALLOW_MEMORY_STORE_IN_PRODUCTION` here.
- Paid API calls (SerpApi/Gemini) stay restricted to active subscribers in
  every mode; no keys are needed for boot.

## Smoke checks after deploy

- `GET /api/health` shows `"store":"postgres"`.
- Signup -> sign in -> create a draft application -> refresh: data persists
  across container restarts (Postgres), unlike the memory store.
- `POST /api/billing/webhook` with a bad signature returns 401.
