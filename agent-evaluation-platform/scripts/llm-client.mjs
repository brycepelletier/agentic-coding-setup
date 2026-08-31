import { getInferenceAdapter } from './inference-adapters.mjs';
import { authenticationHeaders, publicTarget } from './inference-target.mjs';

export async function warmupModel({ target, prompt, systemPrompt, onProgress }) {
  if (!prompt || !systemPrompt) throw new Error('Warmup requires explicit suite-provided system and user prompts');
  const result = await queryModel({ target, input:{ messages:[{ role:'system', content:systemPrompt }, { role:'user', content:prompt }] }, onProgress });
  return {
    kind: 'warmup',
    includedInEvaluation: false,
    includedInAverages: false,
    capturedAt: new Date().toISOString(),
    prompt,
    response: result.visibleResponse,
    performance: result.performance,
    inference: result.inference,
    rawBackendEvidence: result.rawBackendEvidence
  };
}

export async function queryModel({ target, input, onProgress }) {
  const adapter = getInferenceAdapter(target.protocol);
  const resolvedEndpoint = resolveEndpoint(target, adapter.defaultPath);
  const built = adapter.buildRequest({ target, input });
  const requestBodyText = JSON.stringify(built.body);
  const startedAt = Date.now();
  const timing = { startedAt, firstGeneratedAt:null, firstVisibleAt:null };
  onProgress?.({ stage:'request', startedAt:new Date(startedAt).toISOString(), elapsedMs:0 });
  const response = await fetch(resolvedEndpoint, {
    method:'POST',
    headers:{ 'content-type':'application/json', ...authenticationHeaders(target.authentication) },
    body:requestBodyText
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  const consumed = await adapter.consumeResponse(response, timing, onProgress);
  const completedAt = Date.now();
  const promptTokens = numberOrNull(consumed.usage?.prompt_tokens ?? consumed.usage?.input_tokens);
  const outputTokens = numberOrNull(consumed.usage?.completion_tokens ?? consumed.usage?.output_tokens);
  const totalTimeMs = completedAt - startedAt;
  const performance = {
    promptTokens,
    outputTokens,
    totalTokens:numberOrNull(consumed.usage?.total_tokens) ?? (promptTokens !== null && outputTokens !== null ? promptTokens + outputTokens : null),
    tokensPerSecond:outputTokens && totalTimeMs ? outputTokens / (totalTimeMs / 1000) : null,
    timeToFirstVisibleTokenMs:timing.firstVisibleAt === null ? null : timing.firstVisibleAt - startedAt,
    timeToFirstGeneratedTokenMs:timing.firstGeneratedAt === null ? null : timing.firstGeneratedAt - startedAt,
    totalTimeMs,
    peakSystemCpuPercent:null,
    peakSingleCoreCpuPercent:null,
    peakGpuPercent:null,
    peakVramMb:null
  };
  onProgress?.({ stage:'response_complete', elapsedMs:totalTimeMs, performance });
  return {
    visibleResponse:consumed.visibleResponse,
    reasoningResponse:consumed.reasoningResponse,
    finishReason:consumed.finishReason,
    toolCalls:consumed.toolCalls ?? [],
    usage:consumed.usage,
    performance,
    rawBackendEvidence:consumed.rawBackendEvidence,
    inference:{
      target:publicTarget(target),
      protocol:target.protocol,
      resolvedEndpoint,
      resolvedRequestPath:new URL(resolvedEndpoint).pathname,
      input,
      requestParameters:built.requestParameters,
      requestBody:built.body,
      requestBodyText,
      response:{ visible:consumed.visibleResponse, reasoning:consumed.reasoningResponse, finishReason:consumed.finishReason, usage:consumed.usage, toolCalls:consumed.toolCalls ?? [] },
      timing:{ startedAt:new Date(startedAt).toISOString(), completedAt:new Date(completedAt).toISOString(), ...performance }
    }
  };
}

function resolveEndpoint(target, defaultPath) {
  if (target.endpoint) return new URL(target.endpoint).toString();
  const path = target.path ?? defaultPath;
  const base = target.baseUrl.replace(/\/$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
