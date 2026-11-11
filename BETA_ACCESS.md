# Fixed-window beta access

## Approved product scope

Eric approved one shared seven-day free beta window on 11 November 2026, starting only after the final beta-flow test. Late joiners receive the remaining time. The earlier access proposal limits it to 20 analyses per tester across the pilot, public or synthetic documents and no paid searches. Payment collection, a card request and automatic paid conversion are not part of this implementation.

## Inactive by default

`BETA_CAMPAIGN_JSON` is unset by default. This hides beta-code entry and denies redemption. No dates, production invite identities or usable invite codes ship in the repository. Do not populate it until the actual campaign timing and tester accounts are approved. Deploying code does not start the beta clock.

Configuration shape:

```
{
  "id": "<approved immutable campaign ID>",
  "startsAt": "<approved ISO timestamp with timezone>",
  "endsAt": "<exactly seven days after start>",
  "invites": [
    { "userId": "<approved server-generated account ID>", "codeHash": "<SHA256 of a high-entropy invite code>" }
  ]
}
```

A campaign has at most 100 unique account-bound invite hashes. Signup emails are self-asserted, not verified, so an email alone must not establish a tester's identity. The operator confirms the intended account ID before inviting it. Generate each code from at least 24 cryptographically random bytes. Store only its SHA256 hash in configuration. Deliver the code only through an approved private route; do not put plaintext codes in repository files, URLs, screenshots, diagnostics or ordinary logs. No code creation or distribution is performed by this release.

The campaign ID and dates are not a renewal mechanism. Do not replace the pilot ID to bypass an expiry or quota. A later pilot is a separate user decision. Extending configuration does not extend an entitlement already redeemed. Replacing/removing configuration closes access to old beta entitlements; preserve the chosen window throughout the beta.

## What redemption does

`POST /api/beta/redeem` requires an authenticated session and the existing origin protection. It checks the server's time, campaign and account-bound hash. Five attempts per account per ten minutes are allowed per process; new registrations cannot redeem another account's code. The throttle is not a distributed identity-verification service.

Memory and Postgres implement atomic first insertion of a beta entitlement. Existing paid, cancelled, revoked or earlier entitlements are not overwritten. A duplicate valid request returns the original active entitlement without extending it. Mongo fails closed for beta redemption because it has no equivalent primitive here. The legacy manual email/day grant endpoint is disabled, rather than providing a second way around fixed campaign dates. Existing admin revoke/status endpoints remain available.

All cohort analysis claims use the stable `beta_pilot_v1` bucket, with a hard cap of 20, not a monthly allowance. Extending/retrying/redeeming at month end does not reset it. Failed HTTP responses release their request's original usage bucket; a client disconnect alone does not release a running claim. Paid plans keep their monthly buckets. Cohort searches are zero and paid SerpApi/cloud access helpers deny cohort accounts even when keys are configured. Actual analysis forces the offline statutory rule-based preview regardless of a saved model choice.

The Account screen reports the exact beta end, pilot-total usage and no-payment terms. Its timer hides the redemption form at the cutoff; backend checks remain authoritative when a background browser pauses timers. Existing results/drafts are not purged at expiry. New analyses stop, while saved profile/draft ownership and customer deletion rules stay unchanged.

## Verification and release gates

The local synthetic journey covers signup, redemption, actual offline analysis/checklist, Word-compatible `.doc` download, separate draft save, refresh/reopen and expiry denial. Tests cover month boundaries, concurrent cap claims, duplicate redemption, paid/revoked preservation, invalid codes and zero outbound calls from explicit offline mode. The real Postgres test accepts only a disposable loopback database, never a production URL.

Before release: independent review, full tests/typecheck/build and visual checks. Publish/deployment is separate from campaign activation. A live prelaunch smoke needs its own approved synthetic identity and temporary rehearsal setup, not an unannounced start of the real shared window. Main/operator must settle that bounded setup before any live entitlement or configuration change. A local test is not evidence that a live authenticated journey passed.

This is a rule-based beta preview, not proof of language-model analysis quality or payment collection. Testers must verify requirements against the source tender. Confidential-document clearance, safe backup restoration and production account deletion remain out of scope.

## Direct account approval (optional, no promo code)

The deployment operator can add an optional `directAccounts` array to the same
campaign configuration. Keep `invites: []` when no code recipients are planned.
Each entry requires all three approved fields:

```json
{ "userId": "<approved account ID>", "tenantId": "<approved full tenant ID>", "email": "<approved lowercase email>" }
```

No real tester identities or dates are included in this repository. Leave
`BETA_CAMPAIGN_JSON` unset while implementing, testing and deploying the inactive
release. Only after release readiness, calculate the approved fixed start/end
and configure the approved account. The shared start is a deployment decision,
not the next login time; deployment delays consume time after that fixed start.

Before opening traffic, the server validates every listed account ID, tenant ID
and email against the stored records. A mismatch fails startup before granting
any listed accounts. An email alone cannot select an account. Atomic first
insertion uses the same repository primitive as code redemption. Repeated
starts never replace paid, revoked or previous entitlements, extend the end or
reset usage. Existing blocked entitlements are left unchanged and reported as
an aggregate warning, so routine restarts after revocation do not stop the app.
A database failure can leave a subset of newly granted accounts; retries are
idempotent. Do not call an account active without checking its Account screen.

Future-window direct activation fails startup rather than silently scheduling a
grant. At or after expiry the activation helper does nothing, so routine restarts
still allow sign-in and saved drafts. Backend campaign-aware access checks close
beta access at the exact shared cutoff. Removing campaign config closes beta
access without deleting account data; no production deletion is needed.

This is a deployment-only option: it adds no activation endpoint, admin UI,
mailing, password collection or paid provider call. The Account screen reports
the existing active beta status and limits without a code prompt in direct-only
campaigns. A late approved tester uses the unchanged campaign ID/end and receives
only the remaining time. Account-specific confirmation after deployment and the
separately approved real tester analysis remain live operator checks.

## App-managed onboarding and operations dashboard

The normal operator workflow is now in the authenticated Operations dashboard.
Coolify is needed for the initial application rollout, not per-tester setup.
Existing admin account IDs still come from `ADMIN_USER_IDS`; a signup email or
company name cannot grant an admin role. Admin sign-in lands on Operations, with
no company or bidder-profile prerequisite. Customer tools are a separate,
explicit navigation choice. New customer registrations do not receive analysis
access until their selected-account code is successfully redeemed.

Postgres and memory support the app-managed pilot. Postgres adds three new,
non-destructive tables: one immutable campaign, account-bound invite hashes,
and an append-only change record. Mongo fails closed for this option. The
operator starts the one shared seven-day window with an explicit in-app
confirmation. Deployment, sign-in, listing accounts and code issuance do not
restart that clock. No campaign is seeded automatically. Legacy environment
campaign configuration must be absent; conflicting sources fail closed.

The operator searches registered accounts by company/email, selects the stored
account and checks its identity. Issuing a code uses server-generated random
24-byte data, displays the 32-character value once, and stores only SHA256.
No codes/hashes are included in the admin list, audit feed, URLs or logs. The
operator copies it privately to the approved tester/operator. An unused code
can be replaced, immediately invalidating the old one. Paid, revoked or prior
entitlements are never overwritten. This release sends no email or other
external notification. Notification delivery is in the admin dashboard, with
server-confirmed recent activity and a separate full change record.

Redemption locks the campaign and invite in a database transaction, verifies
the signed-in selected account, campaign time and existing entitlement, uses
insert-only entitlement creation, verifies the resulting shape, and records
redemption and audit before commit. A failure rolls the entire transaction
back. The cutoff is checked after waiting for the campaign lock. Concurrent
paid writes arbitrate on the entitlement primary key; beta cannot replace
one. A retry of a successfully redeemed code returns the original entitlement
without extending the end or resetting usage. Revocation prevents reactivation.

The operator sees pilot-total usage, saved-profile presence (not private profile
fields or uploaded files), current access and issue/redemption timestamps.
Admin notifications/status refresh every 30 seconds while visible, paused while
a private code is displayed. Failed refreshes are labelled stale. An explicit
selected-account revoke cancels beta access without deleting saved data. The
change record includes actor/target IDs and time for campaign start, issuance,
redemption and revocation. It does not give arbitrary database, billing,
impersonation or production deletion controls.

Release testing includes memory/HTTP flow, pg-mem SQL-adapter checks, and
real disposable loopback Postgres tests for concurrent start/redemption/cap,
restart persistence, rollback after audit failure, racing paid insertion,
revocation preservation and expiry after lock wait. These tests never accept
production database URLs. Live deployment and Eric's existing admin sign-in
still require confirmation; a local passing test is not live access proof.

Operational limits: a campaign-storage failure closes the whole API with a
sanitized 503 response rather than serving stale access decisions. The static
UI can still load, but account operations need storage recovery. This is
intentional fail-closed behavior, not full service availability. If revoke
races a first redemption, revoke can report not confirmed (409); refresh and
retry after the grant settles. A successful revoke remains authoritative.
The monitoring console is not an infrastructure log reader or external
telemetry system. It shows privacy-limited account/usage/access events and
sanitized operator failures. Tender text, tax PINs, passwords, code hashes,
private profile fields and uploaded documents never enter these payloads.
