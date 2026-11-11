import { assertSafeConfig, type FoundationConfig } from './config';
import { entitlementStatus } from './entitlement';
import type { FoundationRepos } from './repos/types';

/** Deployment-only direct access. Disabled unless explicit account tuples exist.
 * Never replaces an entitlement, resets usage, extends a window or sends mail.
 * No background timer: future-window activation fails rather than silently
 * activating later. Expired campaigns are a no-op so routine restarts after
 * beta closure still serve sign-in and saved drafts.
 */
export async function activateApprovedBetaAccounts(
  repos: FoundationRepos, config: FoundationConfig, now = new Date(),
): Promise<number> {
  assertSafeConfig(config);
  const c = config.betaCampaign;
  if (!c?.directAccounts?.length) return 0;
  if (now >= new Date(c.endsAt)) return 0;
  if (!repos.beta || now < new Date(c.startsAt)) {
    throw new Error('Direct beta activation requires a supported store and an open approved window.');
  }
  // Validate every stored binding before the first write. An email alone can
  // never select an account: signup addresses are not independently verified.
  const blocked = new Set<string>();
  for (const account of c.directAccounts) {
    const user = await repos.users.getById(account.userId);
    const tenant = await repos.tenants.getById(account.tenantId);
    if (!user || !tenant || user.tenantId !== account.tenantId || user.email.toLowerCase() !== account.email) {
      throw new Error('Direct beta activation account binding mismatch. No account credentials are needed.');
    }
    const existing = await repos.entitlements.get(account.tenantId);
    if (existing && (existing.planId !== 'test_cohort' || existing.providerName !== 'operator_comp'
      || existing.providerSubscriptionRef !== `beta:${c.id}` || entitlementStatus(existing, config, now) !== 'active'
      || existing.currentPeriodEnd?.getTime() !== Date.parse(c.endsAt))) {
      blocked.add(account.tenantId);
    }
  }
  let confirmed = 0;
  for (const account of c.directAccounts) {
    if (blocked.has(account.tenantId)) continue;
    await repos.beta.redeem({ tenantId: account.tenantId, planId: 'test_cohort', status: 'active',
      currentPeriodEnd: new Date(c.endsAt), cancelAtPeriodEnd: true, providerName: 'operator_comp',
      providerSubscriptionRef: `beta:${c.id}`, refundedAt: null, lastEventAt: now,
      lastEventId: `beta:${c.id}`, updatedAt: now });
    const ent = await repos.entitlements.get(account.tenantId);
    if (ent?.planId !== 'test_cohort' || ent.providerName !== 'operator_comp'
      || ent.providerSubscriptionRef !== `beta:${c.id}` || entitlementStatus(ent, config, now) !== 'active'
      || ent.currentPeriodEnd?.getTime() !== Date.parse(c.endsAt)) {
      blocked.add(account.tenantId);
      continue;
    }
    confirmed++;
  }
  if (blocked.size) console.warn(`[beta] ${blocked.size} approved account(s) not activated: existing access was preserved.`);
  return confirmed;
}
