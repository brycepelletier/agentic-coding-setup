const adapters = new Map();

export function registerInferenceAdapter(adapter) {
  if (!adapter?.protocol || typeof adapter.buildRequest !== 'function' || typeof adapter.consumeResponse !== 'function') throw new Error('Invalid inference adapter');
  adapters.set(adapter.protocol, adapter);
}

export function getInferenceAdapter(protocol) {
  const adapter = adapters.get(protocol);
  if (!adapter) throw new Error(`Unsupported inference protocol: ${protocol}`);
  return adapter;
}

registerInferenceAdapter({
  protocol: 'openai-chat',
  defaultPath: '/chat/completions',
  buildRequest({ target, input }) {
    const requestParameters = { temperature:0.1, ...target.requestParameters, ...(input.requestParameters ?? {}) };
    const body = {
      ...requestParameters,
      model: target.model,
      messages: input.messages,
      stream: true,
      stream_options: { include_usage:true, ...(requestParameters.stream_options ?? {}) }
    };
    return { body, requestParameters };
  },
  async consumeResponse(response, timing, onProgress) {
    const contentType = response.headers.get('content-type') ?? '';
    let visibleResponse = '';
    let reasoningResponse = '';
    let finishReason = null;
    let usage = null;
    let raw = '';
    if (contentType.includes('text/event-stream')) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        const decoded = decoder.decode(value, { stream:!done });
        raw += decoded;
        buffer += decoded;
        const lines = buffer.split(/\r?\n/);
        buffer = done ? '' : (lines.pop() ?? '');
        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (!data || data === '[DONE]') continue;
          const event = JSON.parse(data);
          const choice = event.choices?.[0];
          const visible = choice?.delta?.content ?? '';
          const reasoning = choice?.delta?.reasoning_content ?? choice?.delta?.reasoning ?? '';
          if ((visible || reasoning) && timing.firstGeneratedAt === null) timing.firstGeneratedAt = Date.now();
          if (visible && timing.firstVisibleAt === null) timing.firstVisibleAt = Date.now();
          visibleResponse += visible;
          reasoningResponse += reasoning;
          if (visible || reasoning) onProgress?.({ stage:'streaming', visibleDelta:visible, reasoningDelta:reasoning, visibleCharacters:visibleResponse.length, reasoningCharacters:reasoningResponse.length, elapsedMs:Date.now() - timing.startedAt });
          if (choice?.finish_reason != null) finishReason = choice.finish_reason;
          if (event.usage) usage = event.usage;
        }
        if (done) break;
      }
    } else {
      raw = await response.text();
      const body = JSON.parse(raw);
      const choice = body.choices?.[0];
      visibleResponse = choice?.message?.content ?? choice?.text ?? '';
      reasoningResponse = choice?.message?.reasoning_content ?? choice?.message?.reasoning ?? '';
      finishReason = choice?.finish_reason ?? null;
      usage = body.usage ?? null;
      if (visibleResponse || reasoningResponse) timing.firstGeneratedAt = Date.now();
      if (visibleResponse) timing.firstVisibleAt = Date.now();
      if (visibleResponse || reasoningResponse) onProgress?.({ stage:'streaming', visibleDelta:visibleResponse, reasoningDelta:reasoningResponse, visibleCharacters:visibleResponse.length, reasoningCharacters:reasoningResponse.length, elapsedMs:Date.now() - timing.startedAt });
    }
    return { visibleResponse, reasoningResponse:reasoningResponse || null, finishReason, usage, rawBackendEvidence:{ contentType, body:raw } };
  }
});
