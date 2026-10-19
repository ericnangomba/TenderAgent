/**
 * Local Model Detection Service
 * Detects local running LLM instances (Ollama, LM Studio, vLLM)
 * and verifies availability of Gemma and Llama 3.1 8B.
 */

export interface IDetectedLocalModel {
  id: string;
  name: string;
  runner: 'ollama' | 'lmstudio' | 'vllm' | 'custom';
  endpoint: string;
  isGemma: boolean;
  isLlama31: boolean;
  sizeBytes?: number;
  family?: string;
  format?: string;
}

export interface ILocalDetectionReport {
  isLocalServerRunning: boolean;
  activeRunner?: 'ollama' | 'lmstudio' | 'vllm' | 'custom';
  activeEndpoint?: string;
  detectedModels: IDetectedLocalModel[];
  hasGemma: boolean;
  hasLlama31: boolean;
  recommendedLocalModel?: string;
  cloudFailoverActive: boolean;
  message: string;
  testedEndpoints: { url: string; reachable: boolean; error?: string }[];
}

const COMMON_LOCAL_ENDPOINTS = [
  { url: 'http://localhost:11434', runner: 'ollama' as const, type: 'ollama' },
  { url: 'http://127.0.0.1:11434', runner: 'ollama' as const, type: 'ollama' },
  { url: 'http://localhost:1234', runner: 'lmstudio' as const, type: 'openai' },
  { url: 'http://localhost:8000', runner: 'vllm' as const, type: 'openai' }
];

/**
 * Checks a specific endpoint with a fast abort timeout
 */
async function probeEndpoint(url: string, timeoutMs: number = 400): Promise<{ reachable: boolean; data?: any; error?: string }> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: controller.signal
    });
    clearTimeout(timer);

    if (res.ok) {
      const json = await res.json().catch(() => ({}));
      return { reachable: true, data: json };
    }
    return { reachable: false, error: `HTTP ${res.status}` };
  } catch (err: any) {
    return { reachable: false, error: err.name === 'AbortError' ? 'Connection timed out' : err.message };
  }
}

/**
 * Probes local environment in parallel for Gemma, Llama 3.1, and local model servers
 */
export async function detectLocalModels(customEndpoint?: string): Promise<ILocalDetectionReport> {
  const testedEndpoints: { url: string; reachable: boolean; error?: string }[] = [];
  const detectedModels: IDetectedLocalModel[] = [];
  let isLocalServerRunning = false;
  let activeRunner: 'ollama' | 'lmstudio' | 'vllm' | 'custom' | undefined;
  let activeEndpoint: string | undefined;

  // On HTTPS browser deployments, mixed-content security blocks plain http://localhost
  const isHttpsBrowser = typeof window !== 'undefined' && window.location.protocol === 'https:';

  if (isHttpsBrowser && !customEndpoint) {
    return {
      isLocalServerRunning: false,
      detectedModels: [],
      hasGemma: false,
      hasLlama31: false,
      cloudFailoverActive: true,
      message: 'Cloud LLM Failover active (Google Gemini 2.5 Flash / Statutory Engine). Air-gapped local model execution is supported on local development instances (http://localhost:3000).',
      testedEndpoints: [{ url: 'http://localhost:11434', reachable: false, error: 'HTTPS browser mixed-content boundary (Cloud failover active)' }]
    };
  }

  const endpointsToTest = customEndpoint
    ? [{ url: customEndpoint, runner: 'custom' as const, type: 'openai' }, ...COMMON_LOCAL_ENDPOINTS]
    : COMMON_LOCAL_ENDPOINTS;

  // Probe all endpoints in parallel for sub-500ms total response time
  const probeResults = await Promise.allSettled(
    endpointsToTest.map(async (ep) => {
      const probeUrl = ep.runner === 'ollama' ? `${ep.url}/api/tags` : `${ep.url}/v1/models`;
      const probe = await probeEndpoint(probeUrl, 400);
      return { ep, probeUrl, probe };
    })
  );

  for (const result of probeResults) {
    if (result.status !== 'fulfilled') continue;
    const { ep, probeUrl, probe } = result.value;
    testedEndpoints.push({ url: probeUrl, reachable: probe.reachable, error: probe.error });

    if (probe.reachable && !isLocalServerRunning) {
      if (ep.runner === 'ollama' && probe.data?.models && Array.isArray(probe.data.models)) {
        isLocalServerRunning = true;
        activeRunner = 'ollama';
        activeEndpoint = ep.url;

        for (const m of probe.data.models) {
          const modelName = m.name || m.model || '';
          const lower = modelName.toLowerCase();
          const isGemma = lower.includes('gemma');
          const isLlama31 = lower.includes('llama3.1') || lower.includes('llama-3.1') || (lower.includes('llama3') && lower.includes('8b'));

          detectedModels.push({
            id: modelName,
            name: modelName,
            runner: 'ollama',
            endpoint: `${ep.url}/v1`,
            isGemma,
            isLlama31,
            sizeBytes: m.size,
            family: m.details?.family || 'llama/gemma',
            format: m.details?.format || 'gguf'
          });
        }
      } else if (probe.data?.data && Array.isArray(probe.data.data)) {
        isLocalServerRunning = true;
        activeRunner = ep.runner;
        activeEndpoint = `${ep.url}/v1`;

        for (const m of probe.data.data) {
          const modelId = m.id || '';
          const lower = modelId.toLowerCase();
          const isGemma = lower.includes('gemma');
          const isLlama31 = lower.includes('llama3.1') || lower.includes('llama-3.1') || (lower.includes('llama3') && lower.includes('8b'));

          detectedModels.push({
            id: modelId,
            name: modelId,
            runner: ep.runner,
            endpoint: `${ep.url}/v1`,
            isGemma,
            isLlama31
          });
        }
      }
    }
  }

  const hasGemma = detectedModels.some(m => m.isGemma);
  const hasLlama31 = detectedModels.some(m => m.isLlama31);

  let recommendedLocalModel: string | undefined;
  if (hasLlama31) {
    recommendedLocalModel = detectedModels.find(m => m.isLlama31)?.id;
  } else if (hasGemma) {
    recommendedLocalModel = detectedModels.find(m => m.isGemma)?.id;
  } else if (detectedModels.length > 0) {
    recommendedLocalModel = detectedModels[0].id;
  }

  let message = '';
  if (isLocalServerRunning && (hasLlama31 || hasGemma)) {
    message = `Local ${activeRunner?.toUpperCase()} runner active! Detected ${detectedModels.length} models including ${hasLlama31 ? 'Llama 3.1 8B' : ''} ${hasGemma ? 'Gemma 2' : ''}. Tasks run locally with automatic cloud failover.`;
  } else if (isLocalServerRunning) {
    message = `Local ${activeRunner?.toUpperCase()} server active at ${activeEndpoint}, but Gemma or Llama 3.1 8B not yet pulled. Cloud failover ready.`;
  } else {
    message = `No local LLM server active on localhost. Automatic Cloud LLM failover active (Gemini 2.5 Flash / Statutory Engine) for all tasks.`;
  }

  return {
    isLocalServerRunning,
    activeRunner,
    activeEndpoint,
    detectedModels,
    hasGemma,
    hasLlama31,
    recommendedLocalModel,
    cloudFailoverActive: true,
    message,
    testedEndpoints
  };
}
