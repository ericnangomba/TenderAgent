/** Account erasure errors are bounded public codes, never database details. */
export class AccountDeletionError extends Error {
  constructor(public code: string, public status = 409) { super(code); }
}
export function hasExternalBilling(provider: string | null | undefined, subscriptionRef?: string | null): boolean {
  return Boolean((provider && !['mock', 'operator_comp'].includes(provider)) || (!provider && subscriptionRef));
}

/** Shared ordinary requests, exclusive erasure. No queue or persistent marker.
 * Hung/disconnected work is not assumed cancelled: erasure times out without
 * touching data. Restarting a sole API process clears such abandoned leases.
 */
export class TenantWorkCoordinator {
  private states = new Map<string, { readers: number; deleting: boolean; unsafe?: boolean; drained?: () => void }>();
  constructor(private drainWaitMs = 30_000, private maxReaders = 64, private requestLeaseMs = 120_000) {}
  async run<T>(tenantId: string, exclusive: boolean, work: () => Promise<T>): Promise<T> {
    const state = this.states.get(tenantId) || { readers: 0, deleting: false };
    if (exclusive && state.unsafe) throw new AccountDeletionError('account_work_outcome_unconfirmed', 503);
    if (state.deleting) throw new AccountDeletionError('account_deletion_in_progress', 409);
    if (!exclusive && state.readers >= this.maxReaders) throw new AccountDeletionError('account_busy', 429);
    this.states.set(tenantId, state);
    if (!exclusive) {
      state.readers++;
      let deadline: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([work(), new Promise<never>((_resolve, reject) => {
          deadline = setTimeout(() => {
            // Do not infer cancellation. Ordinary capacity is released, but
            // this tenant cannot erase until controlled process replacement.
            state.unsafe = true;
            reject(new AccountDeletionError('request_outcome_unconfirmed', 503));
          }, this.requestLeaseMs);
        })]);
      }
      finally {
        if (deadline) clearTimeout(deadline);
        state.readers--;
        if (!state.readers) {
          state.drained?.();
          if (!state.deleting && !state.unsafe) this.states.delete(tenantId);
        }
      }
    }
    state.deleting = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      if (state.readers) await new Promise<void>((resolve, reject) => {
        state.drained = resolve;
        timer = setTimeout(() => reject(new AccountDeletionError('account_busy_retry_later', 503)), this.drainWaitMs);
      });
      if (state.unsafe) throw new AccountDeletionError('account_work_outcome_unconfirmed', 503);
      return await work();
    } finally {
      if (timer) clearTimeout(timer);
      state.drained = undefined; state.deleting = false;
      if (!state.readers && !state.unsafe) this.states.delete(tenantId);
    }
  }
}
