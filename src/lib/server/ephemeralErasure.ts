import type { IFineTuningDataset, IFineTuningJob } from '../types/tender';

/** Only the completed account-erasure path calls this. Public fixtures remain.
 * One process only: deployments must not leave another old writer/replica alive.
 */
export function eraseTenantEphemeral(tenantId: string, state: {
  tenders: Map<string, any>; datasets: IFineTuningDataset[]; jobs: IFineTuningJob[];
  timers: Map<string, ReturnType<typeof setInterval>>;
}): void {
  for (const [key, row] of state.tenders) if (row.tenantId === tenantId) state.tenders.delete(key);
  for (let i = state.datasets.length - 1; i >= 0; i--) if (state.datasets[i].tenantId === tenantId) state.datasets.splice(i, 1);
  for (let i = state.jobs.length - 1; i >= 0; i--) if (state.jobs[i].tenantId === tenantId) {
    const timer = state.timers.get(state.jobs[i].id);
    if (timer) clearInterval(timer);
    state.timers.delete(state.jobs[i].id); state.jobs.splice(i, 1);
  }
}
