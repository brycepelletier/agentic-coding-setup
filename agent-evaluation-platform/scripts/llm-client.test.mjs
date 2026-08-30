import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { queryModel } from './llm-client.mjs';
import { createTarget } from './inference-target.mjs';

test('captures a streamed response and usage from an OpenAI-compatible endpoint', async () => {
  const progress = [];
  let requestBody;
  let requestPath;
  const server = createServer(async (request, response) => {
    let body = '';
    request.setEncoding('utf8');
    for await (const chunk of request) body += chunk;
    requestPath = request.url;
    requestBody = JSON.parse(body);
    response.writeHead(200, { 'content-type':'text/event-stream' });
    response.end([
      'data: {"choices":[{"delta":{"reasoning_content":"thinking"}}]}',
      '',
      'data: {"choices":[{"delta":{"content":"READY"},"finish_reason":"stop"}]}',
      '',
      'data: {"choices":[],"usage":{"prompt_tokens":8,"completion_tokens":1,"total_tokens":9}}',
      '',
      'data: [DONE]',
      ''
    ].join('\n'));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const address = server.address();
    const result = await queryModel({
      target:createTarget({ model:'test-model', protocol:'openai-chat', baseUrl:`http://127.0.0.1:${address.port}/v1`, path:'/custom-chat', requestParameters:{ temperature:0.25, seed:7 } }),
      input:{ messages:[{ role:'user', content:'Hello' }] },
      onProgress:event => progress.push(event)
    });
    assert.equal(requestPath, '/v1/custom-chat');
    assert.equal(requestBody.model, 'test-model');
    assert.equal(requestBody.messages[0].content, 'Hello');
    assert.equal(requestBody.temperature, 0.25);
    assert.equal(requestBody.seed, 7);
    assert.equal(result.visibleResponse, 'READY');
    assert.equal(result.reasoningResponse, 'thinking');
    assert.equal(result.finishReason, 'stop');
    assert.equal(result.performance.promptTokens, 8);
    assert.equal(result.performance.outputTokens, 1);
    assert.equal(result.performance.totalTokens, 9);
    assert.ok(Number.isFinite(result.performance.timeToFirstGeneratedTokenMs));
    assert.ok(Number.isFinite(result.performance.timeToFirstVisibleTokenMs));
    assert.ok(result.performance.timeToFirstGeneratedTokenMs <= result.performance.timeToFirstVisibleTokenMs);
    assert.equal(result.inference.protocol, 'openai-chat');
    assert.equal(result.inference.resolvedRequestPath, '/v1/custom-chat');
    assert.deepEqual(result.inference.requestBody, requestBody);
    assert.match(result.rawBackendEvidence.body, /reasoning_content/);
    assert.equal(progress[0].stage, 'request');
    assert.ok(progress.some(event => event.stage === 'streaming' && event.reasoningDelta === 'thinking'));
    assert.ok(progress.some(event => event.stage === 'streaming' && event.visibleDelta === 'READY'));
    assert.equal(progress.at(-1).stage, 'response_complete');
  } finally {
    server.close();
    await once(server, 'close');
  }
});
