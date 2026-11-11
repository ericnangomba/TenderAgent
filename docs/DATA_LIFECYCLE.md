# Data lifecycle: next increment preparation

Status: local implementation candidate, 11 November 2026. Not published or deployed. Whole-account deletion is a local/test capability for memory and migrated Postgres stores, unavailable for Mongo. It defaults OFF; production refuses boot if ACCOUNT_DELETION_ENABLED=true until durable restore reconciliation is implemented and reviewed. No automatic expiry scheduler is enabled. Owner approved on 11 November 2026 that saved company profiles and application drafts remain until the customer deletes them. The separately approved no-server-analysis-history rule is implemented in this candidate. External-billing records block deletion pending a separate resolution workflow. This document does not approve deletion of any existing account or data.

## Baseline data map (before this candidate)

| Store | Content | Current deletion/expiry | Preparation required |
|---|---|---|---|
| Postgres foundation_tenants | Company name, creation date | None | Include tenant identity in account lifecycle |
| foundation_users | Email, password hash, tenant ID | None | Delete account identity; reject old sessions |
| foundation_sessions | Session token hash, user/tenant ID, expiry | Logout deletes one session; expired token rejected and its row removed when presented | Delete all tenant sessions; housekeeping for abandoned expired rows |
| foundation_profiles | Company profile, encrypted TCS PIN when configured | Explicit profile DELETE | Include in account deletion; no inferred expiry |
| foundation_applications | Tender reference/title, requirements, evidence notes/reasons | Explicit individual draft DELETE | Include all tenant drafts; no inferred expiry |
| foundation_entitlements | Plan/provider subscription metadata | No account erasure | Decide treatment, block unsafe cancellation/deletion interactions |
| foundation_usage_counters | Monthly analysis/lookup counts | None | Decide minimal retention or deletion; do not invent a legal period |
| foundation_billing_events | Provider event ID/type/tenant/date | None | Decide justified exception, if any; preserve replay safety without resurrecting an erased account |
| Alternate connected Mongo `TenderModel` collection | Analysis records, extracted fields, redacted excerpt | Legacy rows not purged; candidate stops all new private analysis persistence | Mongo account deletion remains unavailable pending ownership/transaction work |
| inMemoryTenderStore | Public fixtures and tenant analyses/feed records, including extracted fields and redacted excerpt up to 2,000 characters | New private analyses response-only; legacy process data clears on replacement | Whole-account erasure removes tenant feed rows; preserve public fixtures and other tenants |
| inMemoryDatasets | Public samples, tenant examples | Restart only | Tenant-aware removal; generated examples must never mutate shared sample |
| inMemoryJobs | Public samples, tenant simulated job state | Restart only | Cancel timers and remove tenant jobs during erasure |
| Browser state | App state, static service-worker shell | Logout reload plus app cache purge; APIs network-only | Reuse verified logout cleanup after confirmed account deletion, not before a server failure |
| Backup/restore copies | Provider WAL history, possible exports/backups | Not controlled by row deletion | Document lifecycle, inspect exports/VM backups, ensure deleted data does not silently return on restore |

Generated examples are derivative private content and are included in candidate account deletion. The local fix prevents future shared-fixture contamination, not proof that no past contamination occurred. Repeated generation currently accumulates examples. The baseline analysis/feed Map was keyed by reference number, allowing overwrite across tenants. This candidate eliminates private analysis writes and uses tenant-composite keys for sync, preserving separate public fixtures. This was an availability/data-loss risk, not a proven disclosure.

The baseline Postgres schema has no foreign-key cascades; the local deletion-enabled candidate adds them during startup migration. Default production startup does not add these new constraints. On the baseline, deleting one tenant row would not delete the remaining records. Do not use that as an erasure shortcut. Mongo is an alternative supported driver; do not claim all-driver deletion until its equivalent is implemented and tested or explicitly rejected.

## Whole-account deletion: implemented candidate and release limits

1. Require an authenticated user, current-password reauthentication and an explicit whole-workspace confirmation. Resolve the tenant from the server session, never the request body's tenant ID. Show the affected scope before confirmation. A future multi-user workspace will require a separate owner model; do not silently extend this one-user-per-tenant design.
2. Stop accepting new tenant work during deletion. Every tenant writer, including in-flight analysis completions, profile saves, draft updates, admin grants and webhooks, must participate in a persistent deletion barrier. A request-local authentication check is insufficient because a request can outlive the account.
3. Use a database transaction on one acquired connection. Lock the tenant/deletion state and related writers using one documented lock order. Delete the agreed rows as one unit; failures must roll back. Never execute a destructive all-tenant query. Do not implement this using pool-level BEGIN/query/COMMIT where calls can land on different connections.
4. Maintain the minimal non-content marker needed to reject late writes/replays or ensure all writes require a live tenant under the same lock. Decide marker retention and what it reveals before enabling. A billing webhook must not recreate an entitlement for an erased tenant. Active real subscriptions require a separately authorized cancellation path, not deletion of local state alone.
5. Remove all tenant process-memory content and stop simulated-job timers only after the durable step succeeds. Multi-process/multi-replica operation needs coordinated invalidation or durable tenant-live checks, not a single-process Map-only promise. Return success only for the scope actually completed. An ambiguous COMMIT requires read reconciliation before retry.
6. Clear the browser session/cache after confirmed server success. On failure show a clear error and keep the user signed in for recovery. Do not log passwords, profile content, note text, connection strings or key values.
7. Test with disposable synthetic data and an isolated database. Never use an existing production account as the test fixture.

## Minimum account-deletion tests before review

- Anonymous, wrong-password, cross-origin and arbitrary-tenant-ID attempts rejected.
- Tenant A removed, tenant B and public fixtures unchanged; every session for A invalidated.
- Database rollback on a mid-operation failure; retry/idempotence and ambiguous-COMMIT handling.
- Save/analysis/admin/webhook races cannot recreate deleted data; restart/multiple-replica behavior covered or explicitly unsupported.
- Generated examples stay tenant-owned; no shared fixture contamination.
- All memory stores and job timers included; no late callback resurrects state.
- Explicitly retained metadata, if approved, contains only permitted fields; no unexplained legal/billing exception.
- Backup restore runbook re-applies deletions before reopening access.

## Implemented candidate scope

- `DELETE /api/account` requires a live session, current password and exact DELETE MY ACCOUNT confirmation; five attempts per ten minutes per user. The UI shows scope and irreversible effect, and clears browser state only after confirmed success.
- Only deletion-enabled local/test Postgres startup adds tenant foreign keys with ON DELETE CASCADE on all seven foundation child tables. Existing orphan rows refuse migration; they are not automatically deleted. This is a schema mutation and requires reviewed controlled deployment with old writers stopped.
- Erasure acquires one connection/transaction and tenant row lock. Foreign keys prevent every late child insert/update from referencing a deleted tenant across processes. External-provider entitlement/event records block erasure. Mock/operator-comp records may be erased, no cancellation implied. No persistent tombstone is retained. Ambiguous COMMIT discards its connection and reconciles tenant existence through a separate connection; unconfirmed outcomes fail clearly.
- Process-local ordinary requests run concurrently under shared leases (maximum 64 active per tenant, no queue). Only account erasure takes an exclusive lease, rejects new tenant requests with 409, and waits at most 30 seconds for existing requests before failing without deletion. Handler res.end completion releases its lease even after client disconnect. A disconnected socket alone never releases it. At the two-minute hard request deadline ordinary capacity is released with a bounded error, but the tenant is marked unsafe for erasure until controlled process replacement: a timeout is not cancellation. A subsequent completed response does not silently clear that uncertainty. No unsafe tenant erasure is permitted. These leases are bypassed entirely when deletion is disabled. After drain, derived datasets, simulated jobs/timers and tagged feed records are removed after durable success. Simulated-job IDs use UUIDs so same-clock jobs cannot share timer keys. The local deletion-enabled validation uses a single API process. Multiple simultaneously live replicas cannot guarantee another process's private derivative arrays have been cleared, so do not claim multi-replica erasure. Old releases/writers must remain stopped.
- Mongo account erasure is unavailable/fail-closed because legacy tender ownership and transactions are not established. No silent best-effort all-driver promise.
- Analysis pipeline returns the result without storing it in process Map or Mongo. This also prevents analysis-reference collisions. Explicit training datasets remain separate saved derivative content. Legacy Mongo records are not purged by this change. Current process memory clears on normal controlled replacement; no ad hoc production purge is authorized.
- Synced public-feed records now use tenant-composite Map keys, avoiding one tenant overwriting another's feed entry.

## Retention scaffolding

`dataLifecycle.ts` contains only a pure analysis-expiry preview. Its default is unconfigured/off. It is not imported by the server, does not schedule anything, does not mutate a Map, and does not select an expiry for saved profiles or drafts. A non-null lifetime is test input, not product policy. No environment variable silently activates deletion.

Saved-work rule: profiles and application drafts remain until the customer explicitly deletes them. No inactivity expiry for those records is approved. Eric approved on 11 November 2026 that no server-side analysis history is retained after delivering a result. The pipeline now avoids writing that history in the first place. Explicit saved datasets remain separate. External billing blocks account deletion instead of inventing record retention. No permanent replay marker is required by the Postgres foreign-key design. Existing rows must not be silently expired when a new duration is approved. Add notice/migration policy and tests first.

## Storage and honest privacy wording

Live read-only inspection on 11 November 2026 at 09:06 SAST showed Neon project tenderagent in AWS US East 2 (Ohio), Free plan, one production branch, six-hour history, no snapshots or snapshot schedule. These are dated observations, not immutable configuration. The hosted app is not strictly on-device or air-gapped, and the database must not be described as South-African-only storage.

- Project: https://console.neon.tech/app/projects/broad-fire-10218864/branches/br-patient-dew-bd9meuqp
- Backup panel: https://console.neon.tech/app/projects/broad-fire-10218864/branches/br-patient-dew-bd9meuqp/restore
- History scope: https://neon.com/docs/postgres/backup-restore/history-window
- Separate provider backup assurance: https://neon.com/docs/security/security-overview
- Snapshot rules: https://neon.com/docs/guides/backup-restore

Six-hour recoverable history is not a guarantee that all copies vanish after six hours. The provider security overview separately describes 30-day customer backup retention. Home-server/VM exports and backup settings remain unverified. Do not shorten backups, migrate regions, add a provider or promise a legal deletion deadline by inference.

Current redaction is limited and does not cover all private details. No POPIA certification or confidential-upload clearance is claimed. `docs/FOUNDATION.md` is historical and includes superseded UI/status notes and provisional plan examples; it must not be used as current pricing or retention policy.

## Verification and outstanding limits

Local tests cover request auth/password/confirmation/origin, tenant isolation and all-session invalidation; memory-store cleanup and late work; real isolated Postgres FK migration/idempotence/orphan refusal, cascade across all child tables, forced rollback, blocked late insert and lost-COMMIT acknowledgement reconciliation. Visual synthetic desktop/mobile account deletion tested locally, not on production. Independent v8 review passed the flag-OFF safe rollout, including 149 passing tests and 11 isolated Postgres checks. This does not approve production flag-ON erasure.

Provider recovery copies, legacy Mongo content, home-server/VM backups, restore re-deletion controls and any future real-billing cancellation workflow remain separate. No confidential-upload clearance or compliance certification. Do not restore an old database and reopen access until previously completed deletions are reconciled; no deletion ledger or tested restore automation is supplied here. Stale abandoned-session housekeeping remains open.

## Safe rollout split

The candidate can deliver response-only analyses, tenant-owned dataset generation, strict simulated-start validation, UUID job IDs and tenant-composite feed keys without enabling erasure. Default ACCOUNT_DELETION_ENABLED is false. In that mode the account API reports deletion unavailable, DELETE returns409, the UI hides its deletion form, request leases are bypassed, and Postgres startup does not run the new FK additions. NODE_ENV=production with the flag true refuses boot before connection or listening. This is an enforced gate, not an operator promise. Local synthetic tests explicitly opt in. Removing the production refusal requires new implementation/review of durable deletion/restore reconciliation and its minimal-metadata policy, not an environment-only change.

## Operator preflight and future erasure rollout plan (not executed)

This is a plan, not permission to deploy or mutate production. Do not create a snapshot, backup, branch, export, or provider resource without specific approval. Do not run the candidate startup against production as a preflight: startup performs schema changes.

Read-only preflight, through the authorized operator connection, should count orphan rows without selecting customer fields. The SQL below is prepared only and has not been run against production:

```sql
SELECT 'users' AS child, count(*) AS orphan_rows FROM foundation_users c LEFT JOIN foundation_tenants t ON t.id=c.tenant_id WHERE t.id IS NULL
UNION ALL SELECT 'sessions', count(*) FROM foundation_sessions c LEFT JOIN foundation_tenants t ON t.id=c.tenant_id WHERE t.id IS NULL
UNION ALL SELECT 'entitlements', count(*) FROM foundation_entitlements c LEFT JOIN foundation_tenants t ON t.id=c.tenant_id WHERE t.id IS NULL
UNION ALL SELECT 'billing_events', count(*) FROM foundation_billing_events c LEFT JOIN foundation_tenants t ON t.id=c.tenant_id WHERE t.id IS NULL
UNION ALL SELECT 'usage_counters', count(*) FROM foundation_usage_counters c LEFT JOIN foundation_tenants t ON t.id=c.tenant_id WHERE t.id IS NULL
UNION ALL SELECT 'profiles', count(*) FROM foundation_profiles c LEFT JOIN foundation_tenants t ON t.id=c.tenant_id WHERE t.id IS NULL
UNION ALL SELECT 'applications', count(*) FROM foundation_applications c LEFT JOIN foundation_tenants t ON t.id=c.tenant_id WHERE t.id IS NULL;
```

- Before rollout: independent review must pass, confirm exact deployed revision/store, schema ownership, one API process and all legacy writers stopped. Check existing recovery configuration read-only; any new recovery resource needs separate approval. A nonzero orphan count blocks migration pending a reviewed nondestructive repair plan, never automatic purge.
- Migration: approve a maintenance window and lock impact before starting the candidate. Seven FK additions can lock/scan child tables and startup can fail after adding only some constraints. Each constraint is idempotent; preserve partial constraints and investigate, rather than dropping them or deleting rows to force startup. Do not serve traffic from mixed old/new releases.
- Validation: inspect health/auth/encryption and a fresh synthetic account's isolation/deletion, never an existing customer account. Verify all sessions rejected after its deletion and normal concurrent requests responsive. No paid calls are needed.
- Failure before customer erasure: stop the new process, keep traffic closed, diagnose migration state. Application rollback alone does not roll back constraints; an old writer may depend on orphan writes that are now correctly rejected. Do not automatically drop constraints or restore customer data.
- Failure after customer erasure: do not restore a pre-deletion database and reopen it. A restore can resurrect deleted accounts. Reconcile completed deletions with an approved operational record before reopening. A durable deletion ledger and tested restore reconciliation are still missing; do not claim this runbook is implemented or promise all-copy erasure. Resolve this operational release gate with the owner before enabling production self-serve deletion.
