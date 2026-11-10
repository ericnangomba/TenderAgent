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

## Public access: Netlify proxy + Tailscale Funnel (tester release)

The site is served by Netlify; the backend stays private. netlify.toml
proxies /api/* to the backend's Tailscale Funnel HTTPS address, so the
browser sees one first-party origin and the SameSite=Lax session cookie
just works (no CORS, no SameSite=None).

- Funnel address: https://apphosting.tail1cb332.ts.net (Tailscale
  terminates TLS at the host and forwards to the app's private port only;
  no other service on the host is published by this).
- Required env additions on the backend once behind the proxy:
  - `COOKIE_SECURE=true` (all traffic is HTTPS now)
  - `PUBLIC_ORIGIN=https://tenderagent1.netlify.app` (exact, no trailing
    slash: the origin check accepts this one proxied origin in addition to
    a same-host match; every look-alike stays rejected)
- Deliberately NOT set: `TRUST_PROXY`. What Tailscale and Netlify each do
  with a client-supplied X-Forwarded-For is not verified, so no forwarded
  header is trusted. Consequence: all public requests share one client IP
  at the app, so the per-IP auth rate limit is one pool for the whole
  tester cohort (a shared 429 is possible under concurrent failed logins).
- Registration is publicly reachable, not invite-gated: anyone with the
  link can sign up and use profile/drafts; analysis and paid lookups stay
  blocked (402) until an operator grant or subscription. Funnel is a
  Tailscale beta with non-configurable bandwidth limits - fine for a
  tester cohort, not a scale plan.
- Turn the public route off at any time from the host:
  `sudo tailscale funnel --https=443 off`

## Smoke checks after deploy

- `GET /api/health` shows `"store":"postgres"`.
- Signup -> sign in -> create a draft application -> refresh: data persists
  across container restarts (Postgres), unlike the memory store.
- `POST /api/billing/webhook` with a bad signature returns 401.
