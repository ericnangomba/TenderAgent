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
