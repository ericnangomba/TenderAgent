/**
 * Restore reconciliation for account erasure.
 *
 * Why this exists: deleting a tenant's rows does not touch provider recovery
 * copies. If a database is later restored to a pre-deletion point, the erased
 * tenant - and the in-database ledger row proving it was erased - both come
 * back. The operator therefore keeps an external deletion record (tenant IDs
 * and times, never customer content) and, before reopening access on a
 * restored database, runs this reconciliation with that record.
 *
 * Guarantees:
 * - Only tenant IDs present in the supplied record are touched, ever.
 * - Idempotent: a tenant already absent is reported, not treated as failure.
 * - Fail-closed: without an atomic erasure capability, or when erasure is
 *   blocked (e.g. unresolved external billing), the tenant is reported
 *   'blocked' and left for the operator - never force-deleted.
 * - Nothing is resurrected and no other tenant is modified.
 */
import { AccountDeletionError } from './accountLifecycle';
import type { DeletionLedgerEntry, FoundationRepos } from './repos/types';

export type { DeletionLedgerEntry };

export interface ReconcileOutcome {
  tenantId: string;
  outcome: 're-erased' | 'already-absent' | 'blocked';
  /** Bounded public code (e.g. billing_resolution_required), never detail. */
  error?: string;
}

const MAX_RECONCILE_IDS = 1000;

export async function reconcileRestoredDeletions(
  repos: FoundationRepos,
  erasedTenantIds: string[],
): Promise<ReconcileOutcome[]> {
  if (!repos.accountDeletion) {
    throw new AccountDeletionError('account_deletion_unavailable_for_store', 503);
  }
  if (!Array.isArray(erasedTenantIds) || erasedTenantIds.length > MAX_RECONCILE_IDS
    || erasedTenantIds.some((id) => typeof id !== 'string' || !id.trim())) {
    throw new AccountDeletionError('invalid_reconciliation_record', 400);
  }
  const outcomes: ReconcileOutcome[] = [];
  for (const tenantId of new Set(erasedTenantIds)) {
    try {
      if (!(await repos.tenants.getById(tenantId))) {
        outcomes.push({ tenantId, outcome: 'already-absent' });
        continue;
      }
      await repos.accountDeletion.erase(tenantId);
      if (await repos.tenants.getById(tenantId)) {
        // Erase returned without error but the tenant survived: do not claim success.
        outcomes.push({ tenantId, outcome: 'blocked', error: 'deletion_outcome_unconfirmed' });
      } else {
        outcomes.push({ tenantId, outcome: 're-erased' });
      }
    } catch (e) {
      outcomes.push({
        tenantId,
        outcome: 'blocked',
        error: e instanceof AccountDeletionError ? e.code : 'account_deletion_failed',
      });
    }
  }
  return outcomes;
}
