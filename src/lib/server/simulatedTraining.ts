/** Simulated operator jobs. Dataset lookup fails closed across tenant boundaries. */
import { randomUUID } from 'node:crypto';
import type { Express, Request, Response } from 'express';
import type { Foundation } from './foundation';
import type { IFineTuningDataset, IFineTuningJob } from '../types/tender';

export function registerSimulatedTrainingRoute(app: Express, deps: {
  foundation: Foundation; datasets: IFineTuningDataset[]; jobs: IFineTuningJob[];
  /** Injectable timer for isolated tests; production uses the normal timer. */
  schedule?: typeof setInterval;
  timers?: Map<string, ReturnType<typeof setInterval>>;
}): void {
  const { foundation, datasets, jobs, schedule = setInterval } = deps;
app.post('/api/finetune/start', foundation.requireAdmin, (req: Request, res: Response) => {
  try {
    const { baseModel = 'meta-llama/Meta-Llama-3.1-8B-Instruct', datasetId, loraRank, loraAlpha, epochs, learningRate } = req.body || {};
    if (typeof datasetId !== 'string' || !datasetId.trim() || typeof baseModel !== 'string' || !['meta-llama/Meta-Llama-3.1-8B-Instruct', 'google/gemma-2-9b-it', 'google/gemma-2-27b-it'].includes(baseModel)) {
      res.status(400).json({ success: false, error: 'valid_dataset_and_model_required' });
      return;
    }
    const dataset = datasets.find(d => d.id === datasetId && (!d.tenantId || d.tenantId === req.auth!.tenantId));
    if (!dataset) {
      res.status(404).json({ success: false, error: 'dataset_not_found' });
      return;
    }

    const jobId = `ft-job-${randomUUID()}`;
    const outputName = `${baseModel.includes('llama') ? 'Llama 3.1 8B' : 'Gemma 2 9B'} - SA Procurement LoRA (Job ${jobId})`;

    const newJob: IFineTuningJob = {
      tenantId: req.auth!.tenantId,
      simulated: true,
      id: jobId,
      jobName: `job-${jobId}`,
      baseModel: baseModel as IFineTuningJob['baseModel'],
      datasetId: dataset.id,
      datasetName: dataset.name,
      status: 'training',
      progress: 5,
      currentEpoch: 1,
      totalEpochs: Number(epochs) || 3,
      currentStep: 2,
      totalSteps: (Number(epochs) || 3) * 20,
      currentLoss: 2.38,
      learningRate: Number(learningRate) || 0.0002,
      vramUsageGb: 7.6,
      etaSeconds: 120,
      lossHistory: [
        { step: 1, loss: 2.62 },
        { step: 2, loss: 2.38 }
      ],
      loraRank: Number(loraRank) || 16,
      loraAlpha: Number(loraAlpha) || 32,
      loraDropout: 0.05,
      adapterArtifactName: 'adapter_model.safetensors',
      outputModelName: outputName,
      createdAt: new Date().toISOString()
    };

    jobs.unshift(newJob);

    // Simulate realistic background step-by-step training progression
    let step = 2;
    const interval = schedule(() => {
      step += 3;
      const totalSteps = newJob.totalSteps;
      const progress = Math.min(100, Math.round((step / totalSteps) * 100));
      const epoch = Math.min(newJob.totalEpochs, Math.ceil((step / totalSteps) * newJob.totalEpochs));

      // Exponential decay loss curve
      const decayLoss = Number((0.28 + (2.1 * Math.exp(-step / 14)) + (Math.random() * 0.04)).toFixed(3));

      newJob.progress = progress;
      newJob.currentStep = Math.min(step, totalSteps);
      newJob.currentEpoch = epoch;
      newJob.currentLoss = decayLoss;
      newJob.etaSeconds = Math.max(0, Math.round((totalSteps - step) * 2.2));
      newJob.lossHistory.push({ step: newJob.currentStep, loss: decayLoss });

      if (step >= totalSteps) {
        clearInterval(interval);
        deps.timers?.delete(jobId);
        newJob.status = 'completed';
        newJob.progress = 100;
        newJob.etaSeconds = 0;
        newJob.completedAt = new Date().toISOString();
      }
    }, 1800);
    deps.timers?.set(jobId, interval);

    res.json({ success: true, job: newJob, simulated: true, message: 'Simulated training run for the studio preview - no GPU execution, no adapter artifact is produced. Use the exported Python script for real training.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

}
