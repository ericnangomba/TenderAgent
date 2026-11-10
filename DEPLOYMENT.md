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
  - `PROFILE_FIELD_KEY` (recommended: field-level encryption for the saved SARS TCS
    PIN at rest; generate with `openssl rand -hex 32` on the server and keep it secret.
    When unset the profile is stored unencrypted and /api/health reports
    profileFieldEncryption: off). Key custody: keep your own offline copy of this
    key. If it is lost or changed, stored encrypted PINs can no longer be read -
    the app masks them as unavailable with a warning and preserves the stored data across unrelated
    profile saves, but recovery means restoring the original key; without it the
    affected users must re-enter their PIN. Never send the key over chat or email.
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

### Existing profile PIN migration (Postgres)
When `PROFILE_FIELD_KEY` is configured with `STORE=postgres`, startup runs a
transaction before opening the HTTP listener. Database connection acquisition
has a 15-second timeout; each lock wait is limited to 15 seconds, each SQL
statement to 60 seconds, and idle transaction time to 60 seconds. These are
per-operation limits, not an overall migration deadline. It locks profile writes, validates
that existing encrypted PINs can be read with this key, and encrypts non-empty
legacy plaintext PINs. Other profile fields and `updated_at` are preserved.
Repeated starts do not re-encrypt already protected values. Logs contain only
counts (`encrypted`, `alreadyEncrypted`, `empty`), never values or tenant IDs.
An invalid existing protected value, wrong key, lock timeout or write failure
stops this deployment from serving. Pre-commit failures attempt rollback; a
connection failure while committing can leave the outcome unconfirmed, so do
not infer rollback from a failed startup. Restore the
original key or investigate corruption; do not delete rows to make startup pass.
Use a quiesced cutover, not overlapping releases: stop the previous application
container, verify it is stopped and its API port no longer serves, and confirm
its database work has ended before starting this release. A profile request that
read before the migration but writes after it could otherwise overwrite the
protected value. Check the current deployment platform's stop/restart behavior;
historical logs are not proof of the current state. Keep traffic closed until
the reviewed image, migration counts and health are verified.

Do not restart a plaintext-capable previous release against a migrated database:
it could expose encrypted blobs as PINs or write plaintext over protected data.
Retain the previous image as an artifact only, not an automatic service fallback.
If startup fails and COMMIT status is uncertain, keep service stopped and recover
with an encryption-aware image and the original key. Do not delete protected
rows or restore an older snapshot by default; either can lose user data.

This migrates current database rows only, not provider backups, snapshots,
exports or previously captured logs. Their retention and recovery policies must
be checked separately. No key means no migration and no field-level encryption;
`/api/health` reports that state as off. Mongo deployments still use next-save
legacy rewriting and are not covered by this Postgres migration.
