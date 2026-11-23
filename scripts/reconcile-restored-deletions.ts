/**
 * Operator restore reconciliation for TenderAgent account erasure.
 *
 * When to use: ONLY after the Postgres database has been restored to an
 * earlier point (provider recovery, branch restore, VM export), before
 * customer access reopens. A restore can resurrect accounts whose deletion
 * had completed; this script re-applies those deletions from the operator's
 * external deletion record.
 *
 * Procedure (docs/DATA_LIFECYCLE.md owns the runbook):
 *   1. Keep customer traffic closed (Funnel off) or start the app with
 *      RESTORE_RECONCILIATION=required so every API call is refused.
 *   2. Run: node --import tsx scripts/reconcile-restored-deletions.ts <record-file>
 *      The record file is the operator's external deletion log: one tenant ID
 *      per line, optional " erased at <ISO date>" after a space; blank lines
 *      and lines starting with # are ignored. Tenant IDs only - never emails,
 *      names or any customer content.
 *   3. Every listed tenant that the restore resurrected is erased again,
 *      transactionally, through the same reviewed erasure path. Tenants with
 *      unresolved external billing are reported blocked, never force-deleted.
 *   4. Exit code is 1 if any tenant is blocked or the outcome is unconfirmed;
 *      resolve those before reopening access. Then restart the app WITHOUT
 *      RESTORE_RECONCILIATION and reopen traffic.
 *
 * Requires DATABASE_URL. Uses deletion-capable startup (tenant foreign keys +
 * ledger table); it creates no provider resources and takes no backups.
 */
import { readFileSync } from 'node:fs';
import { connectPostgres, createPostgresRepos } from '../src/lib/server/repos/postgres';
import { reconcileRestoredDeletions } from '../src/lib/server/deletionLedger';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node --import tsx scripts/reconcile-restored-deletions.ts <deletion-record-file>');
  process.exit(2);
}
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required.');
  process.exit(2);
}

const ids = readFileSync(file, 'utf8')
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith('#'))
  .map((line) => line.split(/\s+/)[0]);

const pool = await connectPostgres(process.env.DATABASE_URL, true);
try {
  const repos = createPostgresRepos(pool, true);
  const outcomes = await reconcileRestoredDeletions(repos, ids);
  let blocked = 0;
  for (const o of outcomes) {
    if (o.outcome === 'blocked') blocked++;
    console.log(`${o.outcome}\t${o.tenantId}${o.error ? `\t${o.error}` : ''}`);
  }
  const reErased = outcomes.filter((o) => o.outcome === 're-erased').length;
  const absent = outcomes.filter((o) => o.outcome === 'already-absent').length;
  console.log(`Reconciliation: ${reErased} re-erased, ${absent} already absent, ${blocked} blocked, ${outcomes.length} record(s) checked.`);
  if (blocked) {
    console.error('Resolve blocked tenants before reopening access. Do not restore an older copy over this database.');
    process.exit(1);
  }
} finally {
  await pool.end();
}
