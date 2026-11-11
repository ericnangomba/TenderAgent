/** UI guidance only. The server remains the access and usage authority. */
export interface WorkspaceAccount {
  beta?: { redeemAvailable: boolean; endsAt: string | null };
  accountDeletionAvailable?: boolean;
  entitlement?: { effectiveStatus?: string; planId?: string | null; currentPeriodEnd?: string | null };
  usage?: { analyses: number; serpapiLookups: number };
  allowances?: { includedAnalyses: number; includedSerpapiLookups: number } | null;
}
export function toolsAvailable(account: WorkspaceAccount | null, isAdmin = false, now = Date.now()): boolean {
  if (isAdmin) return true;
  if (account?.entitlement?.effectiveStatus !== 'active') return false;
  const end = account.entitlement.currentPeriodEnd;
  return Boolean(end && Number.isFinite(Date.parse(end)) && now < Date.parse(end));
}
export function accessGuidance(account: WorkspaceAccount | null, failed = false) {
  if (!account) return { title: failed ? 'Access could not be checked' : 'Checking your access', body: failed ? 'Analysis tools stay locked until access is confirmed. Retry the access check. You can still complete your company information.' : 'You can complete your company information while we check your account.' };
  if (account.entitlement?.planId === 'test_cohort') return { title: 'Your beta access has ended', body: 'Analysis tools are locked. Your company information is still available. Contact the operator about future access. No payment is required by this message.' };
  if (account.entitlement?.effectiveStatus === 'none' && account.beta?.redeemAvailable) return { title: 'Please redeem your provided beta code', body: 'Enter your code in Account to activate the analysis tools. No code yet? Ask the person who invited you. You can complete your company information now. Beta access is free; do not pay for a subscription.' };
  return { title: 'Please subscribe to get access to tools', body: 'Analysis tools need an active subscription. You can complete your company information now. Paid subscriptions are not connected yet, so no payment can be taken here. Contact the operator about access.' };
}
