import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const entry = fileURLToPath(new URL('../test.mjs', import.meta.url));
const qualificationDirectory = fileURLToPath(new URL('../test/', import.meta.url));

test('batch target configuration routes through the adapter and persists evidence artifacts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'agent-test-batch-target-'));
  const resultsRoot = join(directory, 'results');
  const requestPaths = [];
  let requestCount = 0;
  const server = createServer(async (request, response) => {
    requestPaths.push(request.url);
    for await (const _ of request) { /* consume request */ }
    requestCount++;
    const content = requestCount === 1
      ? 'READY'
      : '## Finding 1\nStatement: Direct push.\nRelevant Rules: Git authority.\nAssessment: VIOLATION\nReason: Authority boundary.\nAUTHORITY VIOLATIONS: 1\nUNSUPPORTED INFERENCES: 0';
    response.writeHead(200, { 'content-type':'text/event-stream' });
    response.end(`data: ${JSON.stringify({ choices:[{ delta:{ content }, finish_reason:'stop' }] })}\n\ndata: ${JSON.stringify({ choices:[], usage:{ prompt_tokens:10, completion_tokens:5, total_tokens:15 } })}\n\ndata: [DONE]\n`);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const address = server.address();
    const targetFile = join(directory, 'targets.json');
    await writeFile(targetFile, JSON.stringify({ targets:[{ model:'batch-model', protocol:'openai-chat', baseUrl:`http://127.0.0.1:${address.port}/v1`, path:'/custom-chat', requestParameters:{ temperature:0 } }] }));
    const result = await run([entry, 'run', '--targets', targetFile, '--levels=4A'], { AGENT_TEST_RESULTS_ROOT:resultsRoot });
    assert.equal(result.code, 0, result.stderr);
    const outputLines = result.stdout.split(/\r?\n/).filter(Boolean);
    const runLine = outputLines.findIndex(line => line.startsWith('Qualification run: '));
    assert.equal(outputLines[runLine + 1], 'Click here to view live updates: http://agent.eval.local:3000');
    assert.deepEqual(requestPaths, ['/v1/custom-chat','/v1/custom-chat']);
    const [runId] = await readdir(resultsRoot);
    const modelDirectory = join(resultsRoot, runId, 'batch-model');
    const perTestFile = join(modelDirectory, 'level-4a-self-audit.json');
    const report = JSON.parse(await readFile(perTestFile, 'utf8'));
    assert.equal(report.inference.target.protocol, 'openai-chat');
    assert.equal(report.inference.resolvedRequestPath, '/v1/custom-chat');
    assert.equal(report.inference.requestBody.temperature, 0);
    assert.equal(report.inference.artifacts.rawBackendResponse, 'level-4a-self-audit.inference.raw.txt');
    await access(join(modelDirectory, report.inference.artifacts.rawBackendResponse));
    const aggregate = JSON.parse(await readFile(join(resultsRoot, runId, 'run.json'), 'utf8'));
    assert.equal(aggregate.options.targets[0].model, 'batch-model');
    assert.equal(aggregate.options.weighted, false);
    assert.equal(aggregate.weighted, undefined);
    assert.equal(aggregate.models[0].qualificationResults[0].result, 'pass');
    assert.equal(aggregate.models[0].qualificationResults[0].rubricReviewRequired, true);
    assert.equal(JSON.stringify(aggregate).includes('data: [DONE]'), false);
  } finally {
    server.close();
    await once(server, 'close');
    await rm(directory, { recursive:true, force:true });
  }
});

test('--weighted marks a fail-fast run incomplete without scoring skipped tests as zero', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'agent-test-weighted-incomplete-'));
  try {
    const responses = join(directory, 'responses');
    const resultsRoot = join(directory, 'results');
    await createSavedResponses(responses, { failFirst:true });
    const execution = await run([entry, 'run', '--responses', responses, '--weighted'], { AGENT_TEST_RESULTS_ROOT:resultsRoot });
    assert.equal(execution.code, 1);
    const [runId] = await readdir(resultsRoot);
    const aggregate = JSON.parse(await readFile(join(resultsRoot, runId, 'run.json'), 'utf8'));
    assert.equal(aggregate.options.force, false);
    assert.equal(aggregate.options.weighted, true);
    assert.equal(aggregate.weighted.candidates[0].complete, false);
    assert.ok(aggregate.weighted.candidates[0].missingTestCount > 0);
    assert.ok(aggregate.models[0].qualificationResults.some(result => result.result === 'skipped'));
  } finally { await rm(directory, { recursive:true, force:true }); }
});

test('--force --weighted executes the complete discovered suite and emits a leaderboard', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'agent-test-weighted-full-'));
  try {
    const responses = join(directory, 'responses');
    const resultsRoot = join(directory, 'results');
    await createSavedResponses(responses);
    const execution = await run([entry, 'run', '--responses', responses, '--force', '--weighted'], { AGENT_TEST_RESULTS_ROOT:resultsRoot });
    assert.equal(execution.code, 1);
    const [runId] = await readdir(resultsRoot);
    const runDirectory = join(resultsRoot, runId);
    const aggregate = JSON.parse(await readFile(join(runDirectory, 'run.json'), 'utf8'));
    assert.equal(aggregate.options.force, true);
    assert.equal(aggregate.options.weighted, true);
    assert.equal(aggregate.models[0].qualificationResults.length, 13);
    assert.equal(aggregate.models[0].qualificationResults.some(result => result.result === 'skipped'), false);
    assert.equal(aggregate.weighted.candidates[0].complete, false);
    assert.equal(aggregate.weighted.candidates[0].invalidEnvironmentCount, 4);
    assert.equal(aggregate.models[0].qualificationResults.filter(result=>result.result==='invalid_environment').length, 4);
    const summary = await readFile(join(runDirectory, 'qualification-summary.md'), 'utf8');
    assert.match(summary, /Weighted Agent Evaluation/);
    assert.match(summary, /\| Candidate \| Score \| Authority/);
    await access(join(runDirectory, 'weighted-results.json'));
    await access(join(runDirectory, 'weighted-summary.md'));
  } finally { await rm(directory, { recursive:true, force:true }); }
});

function run(arguments_, extraEnvironment) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, arguments_, { stdio:['ignore','pipe','pipe'], env:{ ...process.env, AGENT_EVAL_DASHBOARD_NO_SPAWN:'1', ...extraEnvironment } });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', chunk => stdout += chunk);
    child.stderr.setEncoding('utf8').on('data', chunk => stderr += chunk);
    child.on('exit', code => resolve({ code, stdout, stderr }));
  });
}

async function createSavedResponses(directory, { failFirst = false } = {}) {
  await mkdir(directory, { recursive:true });
  const files = (await readdir(qualificationDirectory)).filter(file => /^level-.*\.md$/i.test(file)).sort((left, right) => left.localeCompare(right, undefined, { numeric:true }));
  for (const [index, file] of files.entries()) {
    const source = await readFile(join(qualificationDirectory, file), 'utf8');
    const expected = source.match(/<!-- AGENT-TEST:EXPECT:BEGIN -->([\s\S]*?)<!-- AGENT-TEST:EXPECT:END -->/)?.[1] ?? '';
    const answers = [...expected.matchAll(/^\s*(\d+)\.\s*(.+?)\s*$/gm)].map(match => `${match[1]}. ${match[2].split('|')[0].replace(/[`*]/g, '').trim()}`);
    const response = failFirst && index === 0 ? '1. WRONG' : answers.join('\n');
    await writeFile(join(directory, file.replace(/\.md$/, '.txt')), response);
  }
}
