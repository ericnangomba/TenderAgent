/** UI guidance only. The server remains the access and usage authority. */
export interface WorkspaceAccount {
  beta?: { redeemAvailable: boolean; endsAt: string | null };
  accountDeletionAvailable?: boolean;
  entitlement?: { effectiveStatus?: string; planId?: string | null; currentPeriodEnd?: string | null };
  freemium?: { includedAnalyses: number; resetsAt: string } | null;
  usage?: { analyses: number; serpapiLookups: number };
  allowances?: { includedAnalyses: number; includedSerpapiLookups: number } | null;
}
export function toolsAvailable(account: WorkspaceAccount | null, isAdmin = false, now = Date.now()): boolean {
  if (isAdmin) return true;
  // Freemium baseline: every signed-in account gets its free monthly analyses.
  if (account?.freemium) return (account.usage?.analyses ?? 0) < account.freemium.includedAnalyses;
  if (account?.entitlement?.effectiveStatus !== 'active') return false;
  const end = account.entitlement.currentPeriodEnd;
  return Boolean(end && Number.isFinite(Date.parse(end)) && now < Date.parse(end));
}
export function accessGuidance(account: WorkspaceAccount | null, failed = false) {
  if (!account) return { title: failed ? 'Access could not be checked' : 'Checking your access', body: failed ? 'Analysis tools stay locked until access is confirmed. Retry the access check. You can still complete your company information.' : 'You can complete your company information while we check your account.' };
  if (account.freemium) {
    const included = account.freemium.includedAnalyses;
    const used = account.usage?.analyses ?? 0;
    if (used < included) return { title: 'Free plan', body: `You have ${included - used} of ${included} free analyses left this month. Use public or synthetic tender documents only.` };
    return { title: `You have used your ${included} free analyses this month`, body: 'Your free analyses reset on the first of next month. A paid plan with more analyses is planned; payments are not connected yet, so no payment can be taken here.' };
  }
  return { title: 'Please subscribe to get access to tools', body: 'Analysis tools need an active subscription. You can complete your company information now. Paid subscriptions are not connected yet, so no payment can be taken here. Contact the operator about access.' };
}
