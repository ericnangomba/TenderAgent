/** Non-destructive lifecycle preparation. No scheduler or deletion is enabled here. */
export interface AnalysisRetentionPolicy {
  /** null means automatic expiry is not configured. No implicit default lifetime. */
  maxAgeMs: number | null;
}

export const UNCONFIGURED_ANALYSIS_RETENTION: Readonly<AnalysisRetentionPolicy> = Object.freeze({ maxAgeMs: null });

/** Pure preview only. Never deletes data or expires saved profiles/drafts.
 * Untagged public fixtures and records without a valid timestamp are excluded.
 * Selecting a duration is an owner decision; this helper is not wired to runtime.
 */
export function previewAnalysisExpiry(
  store: ReadonlyMap<string, { tenantId?: string; createdAt?: string | Date }>,
  policy: AnalysisRetentionPolicy = UNCONFIGURED_ANALYSIS_RETENTION,
  nowMs = Date.now(),
): Array<{ key: string; tenantId: string }> {
  if (policy.maxAgeMs === null) return [];
  if (!Number.isSafeInteger(policy.maxAgeMs) || policy.maxAgeMs <= 0 || !Number.isFinite(nowMs)) {
    throw new Error('A positive integer analysis lifetime and valid clock are required.');
  }
  const expired: Array<{ key: string; tenantId: string }> = [];
  for (const [key, row] of store) {
    if (!row.tenantId || !row.createdAt) continue;
    const createdMs = new Date(row.createdAt).getTime();
    if (Number.isFinite(createdMs) && createdMs <= nowMs - policy.maxAgeMs) {
      expired.push({ key, tenantId: row.tenantId });
    }
  }
  return expired;
}
