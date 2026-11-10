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
      const result = await applyBillingEvent(repos, evt);
      // Always 200 on a verified event - duplicates and stale events are safe,
      // and providers retry on non-2xx.
      res.json({ success: true, applied: result.applied, reason: result.reason });
    },
  );
  return router;
}
