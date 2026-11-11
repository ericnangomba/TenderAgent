# TenderAgent Paid-Service Foundation (historical implementation notes)

> This records earlier increments and contains superseded status notes and provisional plan examples, not current pricing or retention policy. For current lifecycle gaps and release limits see [DATA_LIFECYCLE.md](DATA_LIFECYCLE.md).

## What this branch adds

Multi-tenant subscription foundation, additive and OFF by default
(`AUTH_REQUIRED` unset = the current demo behaves exactly as before):

- **Accounts**: email+password signup/login/logout (`/api/auth/*`), scrypt
  password hashing (Node built-in, no new runtime deps), httpOnly session
  cookies, sessions stored server-side.
- **Tenancy**: every account is a tenant. Company profile (`/api/profile`),
  usage counters and entitlements are keyed per tenant; tender records created
  by `/api/analyze` are tagged with the owning tenant and `/api/tenders`
  returns the shared public feed plus the caller's own records only.
- **Entitlements**: own database is the gating source of truth. State machine
  handles activation, renewal, payment failure, cancellation at period end
  (access continues until the paid-up period ends), immediate cancellation and
  refunds. Missed renewals go past-due with a configurable grace period.
- **Billing providers**: `POST /api/billing/webhook/:provider` verifies raw-body
  HMAC signatures, normalizes events, applies them idempotently (duplicate
  deliveries are safe) and ignores out-of-order events. Only a **mock provider**
  is implemented; Paystack/PayFast adapters plug into the same interface once
  the provider decision and merchant onboarding are verified.
- **Spend guards**: `/api/analyze` (LLM cost) and the SerpApi routes require an
  active subscription with allowance remaining. Plans carry explicit monthly
  allowances (provisional: R250/month with 60 analyses + 30 SerpApi lookups) -
  a subscription is not unlimited paid-API usage.
- **Storage**: repository interfaces with an in-memory driver (default,
  dev/tests) and a MongoDB/mongoose driver (`STORE=mongo` + `MONGODB_URI`),
  verified against a disposable local mongod in tests.

## Second increment additions (same branch)

- **Hardening**: origin/CSRF validation on state-changing API calls, auth
  endpoint rate limiting, request payload limits (413), Secure cookie
  auto-detection behind HTTPS proxies, atomic allowance claims (proven under
  20-way concurrency), webhook crash-recovery ordering (apply-then-record),
  login responses that never reveal whether an email exists.
- **SerpApi spend rule enforced in every mode**: live lookups only for a
  signed-in tenant with an active subscription and allowance remaining.
  Signed-out/demo always gets the clearly-labelled offline sample feed -
  verified live with a fake API key set.
- **Bid readiness engine** (`/api/applications/*`, sign-in always required):
  drafts save incomplete at any time; `mark-ready` refuses (409) until every
  requirement is satisfied. Every requirement names its source (tender clause
  or official rule). Unverified applicability stays `needs_review` and blocks
  readiness. Never submits anything, never claims guaranteed eligibility.
- **CIDB rule grounding** (Eric's SME discovery, Thomas Dlamini, Oct 16):
  official cidb.org.za confirms CID Regulations 2004 (as amended) bar
  public-sector clients from awarding construction works contracts to
  unregistered contractors, and clients must state the required grading in the
  tender data itself. So: when tender text mentions CIDB we seed a
  `needs_review` requirement sourced to CIDB Act 38 of 2000 / cidb.org.za -
  the exact class and grading always come from the tender document, confirmed
  by a human. No blanket CIDB rule for non-construction trades.
- **Account UI**: sign-in/create-account/workspace panel (own usage vs
  allowances), theme-matched, session restore on load, per-workspace profile
  reload. Verified with real-browser screenshots at 1440x900 and 390x844.

## Verified

- 44+ automated tests (`npm test`): auth flows, entitlement state machine,
  webhook signature/idempotency/ordering, guards in both modes, tenant
  isolation, Mongo repos against a real (in-memory-server) mongod.
- Real server boot checked in both modes: demo mode unchanged; guarded mode
  returns 401 unauthenticated, 402 without subscription.
- `npm run lint` (tsc) and `npm run build` (vite) clean.

## Not yet done / open decisions

- Real billing provider (needs provider decision + Eric's merchant onboarding).
- Frontend for bid applications/readiness (API + engine exist; screens not built).
- Mongo driver needs a run against the real deployment database.
- Password reset / email verification flow.
- Retention-setting enforcement (the UI's session/7/30-day choice is not yet
  wired to deletion jobs).

## Measuring the product promise: draft vs done

"Four days to under three minutes" must be measured as a **completed,
accurate, human-reviewed tender application**, not as draft generation time.
A fast wrong draft has no value. The benchmark to build against:

1. End-to-end wall time: document in -> reviewed application ready to submit.
2. Accuracy: compliance items extracted vs the document's actual requirements
   (missing returnables are the failure mode that disqualifies SMEs).
3. Human review load: how many corrections a person must make before
   submission.

Test corpus: real public tender documents (no private company data needed),
starting with the SME friend's walkthrough of which steps take him four days.

## Security remediation (post-review round)

- /api/models/active: auth required in every mode; per-tenant selection from a server-side
  allowlist; client baseUrl/apiKey rejected; responses never include secrets (was: echoed
  the server's GEMINI_API_KEY to anyone).
- SSRF closed: /api/analyze ignores client-supplied engine config; local-runner calls carry
  no Authorization header; Gemini key only via the official SDK. /api/models/detect probes
  loopback endpoints only.
- /api/tenders: anonymous callers receive only the untagged public feed; tenant records are
  visible to their owning tenant alone. eTenders sync tags stored leads per tenant.
- Mutators (profile POST, finetune datasets/start/deploy/compare/generate) require an
  account in EVERY mode; datasets/jobs are tenant-scoped; deploy is labelled simulated and
  never changes the shared engine.
- Billing: no shared default webhook secret (random per-boot in dev, disabled in production
  without MOCK_BILLING_SECRET); equal-timestamp events ordered deterministically by eventId;
  activation without periodEnd defaults to ~1 month so access still expires; production
  refuses the in-memory store without ALLOW_MEMORY_STORE_IN_PRODUCTION=true.
- Paid-call guards in every mode: cloud AI (Gemini) and SerpApi spend only for signed-in
  active subscribers, and the allowance is claimed ATOMICALLY exactly once per request in
  every mode (the access helper reuses the route guard's claim when present, otherwise
  claims it itself - closing the unmetered-subscriber gap when AUTH_REQUIRED is unset).
  When usage metering itself fails, the paid call is denied (fail closed). Consumed units
  are released when the paid resource was not actually used (missing key, failed lookup,
  pipeline error).
- Misc: async scrypt; trust proxy off by default (TRUST_PROXY env); concurrency cap
  (HEAVY_OPS_MAX, default 4) on parse/analyze; payload limits kept.
- Honest claims: /api/health reports config facts only; UI labels are state-dependent or
  neutral; the fine-tuning studio is labelled simulated end-to-end; generated bid documents
  say "on file", never "verified/compliant".
- Host probing closed: /api/models/detect requires a signed-in account in every mode and
  still only probes loopback endpoints.
- Login throttling: per-IP-PLUS-per-account. The account bucket counts failures only, so
  the owner's successful logins never spend it and the window always clears on its own;
  credential stuffing across rotating IPs still hits it. Tradeoff: sustained failures
  against one account throttle that account's logins (owner included) for the window.
- Runtime regressions: test/security.test.ts boots the real server and asserts every item
  above (including exactly-once metering in demo mode and cross-IP account throttling);
  test/entitlement-determinism.test.ts covers ordering/fail-closed config;
  test/hardening.test.ts covers allowance bounding and same-request single claims.

### Known limits (documented, not claimed as complete)
- PII redaction before AI processing covers 13-16 digit sequences (SA ID numbers and
  card-like numbers), email addresses, SA phone numbers (contiguous, space-separated
  or +27 form; dash-separated local forms are deliberately not matched because tender
  references look identical) and SA VAT numbers. Names, physical addresses and other
  personal details are NOT masked.
- In demo mode (AUTH_REQUIRED unset) analysis is free; paid external calls stay gated.
