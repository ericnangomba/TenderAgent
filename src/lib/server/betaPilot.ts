import type { Entitlement } from './repos/types';
export interface PilotCampaign { id: string; startsAt: string; endsAt: string; createdBy: string }
export interface PilotChange { action: 'started' | 'code_issued' | 'redeemed' | 'revoked' | 'start_failed' | 'issue_failed' | 'revoke_failed'; actorId: string; userId: string | null; at: string }
export interface PilotAccount { userId: string; tenantId: string; email: string; companyName: string; status: string; planId: string | null; analyses: number; lookups: number; hasSavedProfile: boolean; issuedAt: string | null; redeemedAt: string | null }
export interface PilotInvite { userId: string; tenantId: string; campaignId: string; codeHash: string; issuedBy: string; issuedAt: string; redeemedAt: string | null }
export interface PilotStore {
  campaign(): Promise<PilotCampaign | null>;
  changes(): Promise<PilotChange[]>;
  failure(actorId: string, action: 'start_failed' | 'issue_failed' | 'revoke_failed', now: Date): Promise<void>;
  revoke(userId: string, tenantId: string, actorId: string, now: Date): Promise<void>;
  start(c: PilotCampaign): Promise<PilotCampaign>;
  accounts(query: string): Promise<PilotAccount[]>;
  issue(i: PilotInvite): Promise<void>;
  redeem(userId: string, codeHash: string, now: Date): Promise<Entitlement>;
}
export function pilotEntitlement(c: PilotCampaign, tenantId: string, now: Date): Entitlement {
  return { tenantId, planId: 'test_cohort', status: 'active', currentPeriodEnd: new Date(c.endsAt), cancelAtPeriodEnd: true,
    providerName: 'operator_comp', providerSubscriptionRef: `beta:${c.id}`, refundedAt: null,
    lastEventAt: now, lastEventId: `beta:${c.id}`, updatedAt: now };
}
export function pilotOpen(c: PilotCampaign | null, now: Date): c is PilotCampaign {
  return Boolean(c && +now >= Date.parse(c.startsAt) && +now < Date.parse(c.endsAt));
}
export function matchingPilotEntitlement(e: Entitlement | null, c: PilotCampaign): e is Entitlement {
  return Boolean(e && e.planId === 'test_cohort' && e.status === 'active' && e.providerName === 'operator_comp'
    && e.providerSubscriptionRef === `beta:${c.id}` && e.currentPeriodEnd?.getTime() === Date.parse(c.endsAt) && !e.refundedAt);
}
