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
 * Checks a specific endpoint with an abort timeout
 */
async function probeEndpoint(url: string, timeoutMs: number = 800): Promise<{ reachable: boolean; data?: any; error?: string }> {
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
 * Probes local environment for Gemma, Llama 3.1, and local model servers
 */
export async function detectLocalModels(customEndpoint?: string): Promise<ILocalDetectionReport> {
  const testedEndpoints: { url: string; reachable: boolean; error?: string }[] = [];
  const detectedModels: IDetectedLocalModel[] = [];
  let isLocalServerRunning = false;
  let activeRunner: 'ollama' | 'lmstudio' | 'vllm' | 'custom' | undefined;
  let activeEndpoint: string | undefined;

  const endpointsToTest = customEndpoint
    ? [{ url: customEndpoint, runner: 'custom' as const, type: 'openai' }, ...COMMON_LOCAL_ENDPOINTS]
    : COMMON_LOCAL_ENDPOINTS;

  for (const ep of endpointsToTest) {
    // 1. If Ollama runner check
    if (ep.runner === 'ollama') {
      const probe = await probeEndpoint(`${ep.url}/api/tags`);
      testedEndpoints.push({ url: `${ep.url}/api/tags`, reachable: probe.reachable, error: probe.error });

      if (probe.reachable && probe.data?.models && Array.isArray(probe.data.models)) {
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
        break; // Found active Ollama server
      }
    }
    // 2. OpenAI-compatible local servers (LM Studio, vLLM, custom)
    else {
      const probe = await probeEndpoint(`${ep.url}/v1/models`);
      testedEndpoints.push({ url: `${ep.url}/v1/models`, reachable: probe.reachable, error: probe.error });

      if (probe.reachable && probe.data?.data && Array.isArray(probe.data.data)) {
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
        break;
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
    message = `Local ${activeRunner?.toUpperCase()} runner active! Detected ${detectedModels.length} models including ${hasLlama31 ? 'Llama 3.1 8B' : ''} ${hasGemma ? 'Gemma 2' : ''}. Tasks will run locally with automatic cloud failover.`;
  } else if (isLocalServerRunning) {
    message = `Local ${activeRunner?.toUpperCase()} server active at ${activeEndpoint}, but Gemma or Llama 3.1 8B not yet pulled. Run 'ollama pull llama3.1:8b' or 'ollama pull gemma2:9b'. Cloud failover ready.`;
  } else {
    message = `No local LLM server active on localhost (ports 11434, 1234, 8000). Automatic Cloud LLM failover active (Gemini 2.5 Flash / Statutory Engine) for all tasks.`;
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
