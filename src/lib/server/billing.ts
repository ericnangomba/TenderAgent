/**
 * Billing provider abstraction. Only the mock provider is implemented; real
 * providers (Paystack / PayFast) plug in behind the same interface once their
 * exact subscription API and Eric's merchant eligibility are verified.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { Router, raw } from 'express';
import type { FoundationRepos, NormalizedBillingEvent } from './repos/types';
import { applyBillingEvent } from './entitlement';

export interface BillingProvider {
  name: string;
  /** Verifies the raw request body and returns the normalized event, or null on bad signature/payload. */
  verifyAndNormalize(rawBody: Buffer, signatureHeader: string | undefined): NormalizedBillingEvent | null;
}

const VALID_TYPES = new Set([
  'subscription.activated', 'subscription.renewed', 'subscription.payment_failed',
  'subscription.cancellation_scheduled', 'subscription.cancelled', 'subscription.refunded',
]);

export class MockBillingProvider implements BillingProvider {
  name = 'mock';
  constructor(private secret: string) {}

  static sign(secret: string, rawBody: Buffer | string): string {
    return 'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex');
  }

  verifyAndNormalize(rawBody: Buffer, signatureHeader: string | undefined): NormalizedBillingEvent | null {
    if (!signatureHeader) return null;
    const expected = MockBillingProvider.sign(this.secret, rawBody);
    const a = Buffer.from(expected);
    const b = Buffer.from(signatureHeader);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    try {
      const p = JSON.parse(rawBody.toString('utf8'));
      if (typeof p.eventId !== 'string' || !VALID_TYPES.has(p.type) || typeof p.tenantId !== 'string') return null;
      return {
        eventId: p.eventId,
        provider: this.name,
        type: p.type,
        tenantId: p.tenantId,
        planId: typeof p.planId === 'string' ? p.planId : undefined,
        subscriptionRef: typeof p.subscriptionRef === 'string' ? p.subscriptionRef : undefined,
        periodEnd: p.periodEnd ? new Date(p.periodEnd) : undefined,
        occurredAt: p.occurredAt ? new Date(p.occurredAt) : new Date(),
      };
    } catch {
      return null;
    }
  }
}

/**
 * Paystack (paystack.co) provider. Webhook authenticity: HMAC-SHA512 of the
 * exact raw request bytes with the merchant secret key, hex digest in the
 * x-paystack-signature header (https://paystack.com/docs/payments/webhooks/).
 * Event mapping covers the subscription lifecycle TenderAgent needs for the
 * R250/month plan; anything else is ignored (acked, not applied).
 * Prepared from Paystack's published docs only - no merchant account exists
 * yet, so no live payload has been observed; field names come from the docs.
 */
export class PaystackBillingProvider implements BillingProvider {
  name = 'paystack';
  constructor(private secret: string, private planCode: string) {}

  static sign(secret: string, rawBody: Buffer | string): string {
    return createHmac('sha512', secret).update(rawBody).digest('hex');
  }

  verifyAndNormalize(rawBody: Buffer, signatureHeader: string | undefined): NormalizedBillingEvent | null {
    if (!signatureHeader) return null;
    const expected = PaystackBillingProvider.sign(this.secret, rawBody);
    const a = Buffer.from(expected);
    const b = Buffer.from(signatureHeader);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    try {
      const p = JSON.parse(rawBody.toString('utf8'));
      const event: string = p.event;
      const d = p.data || {};
      // Tenant binding: checkout must pass metadata.tenantId when creating
      // the subscription; a missing binding means we cannot attribute the
      // event, so it is rejected rather than guessed.
      const tenantId = d.metadata?.tenantId;
      if (typeof tenantId !== 'string' || !tenantId) return null;
      // Only events for our subscription plan; one-time charges or other
      // products are not subscription lifecycle signals for us.
      const plan = d.plan?.plan_code || d.plan_code || d.subscription?.plan?.plan_code;
      const typeMap: Record<string, string> = {
        'subscription.create': 'subscription.activated',
        'charge.success': 'subscription.renewed',
        'invoice.payment_failed': 'subscription.payment_failed',
        'subscription.not_renewing': 'subscription.cancellation_scheduled',
        'subscription.disable': 'subscription.cancelled',
      };
      const type = typeMap[event];
      if (!type) return null;
      if (event === 'charge.success' && plan && this.planCode && plan !== this.planCode) return null;
      const ref = d.subscription_code || d.subscription?.subscription_code || d.reference;
      const idSeed = d.id ?? d.subscription_code ?? d.reference ?? d.customer?.customer_code;
      if (idSeed === undefined || idSeed === null) return null;
      return {
        eventId: `${event}:${idSeed}`,
        provider: this.name,
        type: type as NormalizedBillingEvent['type'],
        tenantId,
        planId: typeof plan === 'string' ? plan : undefined,
        subscriptionRef: typeof ref === 'string' ? ref : undefined,
        periodEnd: d.next_payment_date ? new Date(d.next_payment_date) : undefined,
        occurredAt: d.paid_at ? new Date(d.paid_at) : new Date(),
      };
    } catch {
      return null;
    }
  }
}

/**
 * Raw-body webhook router. Must be mounted BEFORE express.json() so HMAC
 * signatures are verified against the exact bytes the provider sent.
 */
export function createWebhookRouter(providers: BillingProvider[], repos: FoundationRepos): Router {
  const router = Router();
  router.post(
    '/:provider',
    raw({ type: '*/*' }),
    async (req, res) => {
      const provider = providers.find((p) => p.name === req.params.provider);
      if (!provider) {
        res.status(404).json({ success: false, error: 'unknown_provider' });
        return;
      }
      const signature = req.headers['x-billing-signature'];
      const evt = provider.verifyAndNormalize(
        req.body as Buffer,
        Array.isArray(signature) ? signature[0] : signature,
      );
      if (!evt) {
        res.status(401).json({ success: false, error: 'invalid_signature_or_payload' });
        return;
      }
      let result;
      try { result = await applyBillingEvent(repos, evt); }
      catch {
        if (!await repos.tenants.getById(evt.tenantId)) {
          res.json({ success: true, applied: false, reason: 'tenant_missing' }); return;
        }
        res.status(503).json({ success: false, error: 'billing_event_failed' }); return;
      }
      // Always 200 on a verified event - duplicates and stale events are safe,
      // and providers retry on non-2xx.
      res.json({ success: true, applied: result.applied, reason: result.reason });
    },
  );
  return router;
}
