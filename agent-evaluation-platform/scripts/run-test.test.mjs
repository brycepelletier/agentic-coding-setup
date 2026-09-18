import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const runner = fileURLToPath(new URL('../test.mjs', import.meta.url));

test('warms a direct live test once and excludes warmup telemetry from test performance', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'agent-test-warmup-'));
  const requests = [];
  const server = createServer(async (request, response) => {
    let body = '';
    request.setEncoding('utf8');
    for await (const chunk of request) body += chunk;
    requests.push(JSON.parse(body));
    const content = requests.length === 1 ? 'READY' : '1. YES';
    const usage = requests.length === 1
      ? { prompt_tokens:1000, completion_tokens:1000, total_tokens:2000 }
      : { prompt_tokens:10, completion_tokens:2, total_tokens:12 };
    response.writeHead(200, { 'content-type':'text/event-stream' });
    response.end(`data: ${JSON.stringify({ choices:[{ delta:{ content }, finish_reason:'stop' }] })}\n\ndata: ${JSON.stringify({ choices:[], usage })}\n\ndata: [DONE]\n`);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const testFile = join(directory, 'level-1-warmup-test.md');
    const jsonFile = join(directory, 'result.json');
    await writeFile(testFile, '# Test\n<!-- AGENT-TEST:PROMPT:BEGIN -->\nAnswer 1. YES\n<!-- AGENT-TEST:PROMPT:END -->\n<!-- AGENT-TEST:EXPECT:BEGIN -->\n1. YES\n<!-- AGENT-TEST:EXPECT:END -->\n<!-- AGENT-TEST:EVALUATION:BEGIN -->\nExact answer.\n<!-- AGENT-TEST:EVALUATION:END -->\n');
    const address = server.address();
    const result = await run([runner, 'single', testFile, '--url', `http://127.0.0.1:${address.port}/v1`, '--model', 'test-model', '--json', jsonFile]);
    assert.equal(result.code, 0, result.stderr);
    assert.equal(requests.length, 2);
    assert.match(requests[0].messages[1].content, /READY/);
    assert.match(requests[1].messages[1].content, /Answer 1\. YES/);
    const report = JSON.parse(await readFile(jsonFile, 'utf8'));
    assert.equal(report.warmup.includedInEvaluation, false);
    assert.equal(report.warmup.includedInAverages, false);
    assert.equal(report.warmup.performance.outputTokens, 1000);
    assert.equal(report.performance.outputTokens, 2);
    assert.equal(report.suiteVersion, '1.3.0');
    assert.equal(report.inference.protocol, 'openai-chat');
    assert.equal(report.inference.target.model, 'test-model');
    assert.match(report.inference.systemPrompt.content, /qualification test/);
    assert.equal(report.inference.extractedTestPrompt, 'Answer 1. YES');
    assert.deepEqual(report.inference.input.messages, requests[1].messages);
    assert.deepEqual(report.inference.requestBody, requests[1]);
    assert.equal(report.inference.response.visible, '1. YES');
    assert.equal(report.inference.response.finishReason, 'stop');
    assert.deepEqual(report.backendUsage, { prompt_tokens:10, completion_tokens:2, total_tokens:12 });
    assert.ok(Number.isFinite(report.performance.timeToFirstVisibleTokenMs));
    assert.ok(Number.isFinite(report.performance.timeToFirstGeneratedTokenMs));
    assert.equal(report.inference.artifacts.rawBackendResponse, 'result.inference.raw.txt');
    assert.equal(report.warmup.inference.artifacts.rawBackendResponse, 'result.warmup.raw.txt');
    await access(join(directory, report.inference.artifacts.rawBackendResponse));
    await access(join(directory, report.warmup.inference.artifacts.rawBackendResponse));
    assert.equal(JSON.stringify(report).includes('data: [DONE]'), false);
  } finally {
    server.close();
    await once(server, 'close');
    await rm(directory, { recursive:true, force:true });
  }
});

function run(args) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, args, { stdio:['ignore','pipe','pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', chunk => stdout += chunk);
    child.stderr.setEncoding('utf8').on('data', chunk => stderr += chunk);
    child.on('exit', code => resolve({ code, stdout, stderr }));
  });
}
