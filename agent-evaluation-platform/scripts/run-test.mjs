#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import process from 'node:process';
import { basename, dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { queryModel, warmupModel } from './llm-client.mjs';
import { createTarget, loadTargetFile, parseRequestParameters, publicTarget } from './inference-target.mjs';
import { startHostMetricsSampler } from './host-metrics.mjs';
import { extractSystemPrompt, loadSuiteConfig } from './suite-config.mjs';
import { showHelp, validateArguments, wantsHelp } from './cli-arguments.mjs';
import { createLiveProgressWriter } from './live-progress.mjs';

const [, , file, ...args] = process.argv;
const cliArgs = process.argv.slice(2);
const HELP = `
Usage:
  test.mjs single TEST.md --target TARGET.json [options]
  test.mjs single TEST.md --url URL [--model MODEL] [options]
  test.mjs single TEST.md --response FILE|- [options]
  test.mjs single TEST.md

Run one qualification test. With no response or inference target, print its extracted prompt.

Target options:
  --target FILE          JSON inference target.
  --model MODEL          Model identifier.
  --protocol NAME        Inference protocol; default openai-chat.
  --url URL              Base URL used with the protocol's path.
  --endpoint URL         Complete request endpoint; cannot combine with --path.
  --path PATH            Override the protocol's default request path.
  --auth-env NAME        Environment variable containing a bearer token.
  --request-params JSON  Additional protocol request parameters.

Test options:
  --response FILE|-      Evaluate a saved response file or standard input.
  --json FILE            Save structured evaluation and evidence JSON.
  --warmup-prompt TEXT   Override the greeting sent before a direct live test.
  --no-system-prompt     Send only the extracted test prompt unless the protocol requires otherwise.
  --host-metrics         Sample host CPU/GPU/VRAM during the qualification request.
  --sample-ms MS         Host sampling interval; default 200.
  --gpu-command FILE     GPU sampler command; default nvidia-smi.
  -h, --help             Show this help.

Environment:
  MODEL, OPENAI_API_KEY, TEMPERATURE, QUALIFICATION_WARMUP_PROMPT

Every direct live invocation warms independently. Warmup messages and metrics
remain isolated from the qualification request and its averages.
`;
if (wantsHelp(cliArgs)) showHelp(HELP);
try {
  validateArguments(cliArgs, {
    valueOptions:['--target','--model','--protocol','--url','--endpoint','--path','--auth-env','--request-params','--response','--json','--warmup-prompt','--sample-ms','--gpu-command'],
    flags:['--no-system-prompt','--host-metrics'], maxPositionals:1
  });
} catch (error) { showHelp(HELP, error.message); }
const get = name => { const index=args.findIndex(value=>value===name || value.startsWith(`${name}=`)); return index<0 ? undefined : (args[index].includes('=') ? args[index].slice(name.length+1) : args[index+1]); };
if (!file || file.startsWith('-')) showHelp(HELP, 'Provide a test Markdown file');
if (get('--url') && get('--endpoint')) showHelp(HELP, 'Use either --url or --endpoint, not both');
if (get('--endpoint') && get('--path')) showHelp(HELP, '--endpoint is complete and cannot be combined with --path');
const hasLiveTarget = Boolean(get('--target') || get('--url') || get('--endpoint') || process.env.AGENT_TEST_TARGET_JSON);
if (get('--response') && hasLiveTarget) showHelp(HELP, 'Use either --response or a live inference target, not both');

const suite = await loadSuiteConfig();
const source = await readFile(file, 'utf8');
const prompt = source.match(/<!-- AGENT-TEST:PROMPT:BEGIN -->([\s\S]*?)<!-- AGENT-TEST:PROMPT:END -->/)?.[1]?.trim();
if (!prompt) throw new Error(`Missing prompt markers in ${file}`);
const systemPrompt = extractSystemPrompt(source, suite, { disabled:args.includes('--no-system-prompt') });
const responseFile = get('--response');
let response;
let queryResult = null;
let warmup = null;
let target = null;
let hostMetrics = null;
const startedAt = Date.now();
const progressWriter = process.env.AGENT_TEST_PROGRESS_FILE ? createLiveProgressWriter(process.env.AGENT_TEST_PROGRESS_FILE, {
  runId:process.env.AGENT_TEST_RUN_ID ?? null,
  model:process.env.AGENT_TEST_MODEL ?? null,
  test:basename(file),
  level:file.match(/level-([0-9]+a?)/i)?.[1]?.toUpperCase() ?? null
}) : null;
progressWriter?.update({ stage:'preparing', elapsedMs:0 });

if (responseFile) {
  response = responseFile === '-' ? await readStdin() : await readFile(responseFile, 'utf8');
} else if (hasLiveTarget) {
  try {
    target = await resolveTarget();
    if (process.env.AGENT_TEST_PARENT_WARMED !== '1') {
      console.log('WARMUP: greeting and model load');
      warmup = await warmupModel({
        target,
        prompt:get('--warmup-prompt') ?? process.env.QUALIFICATION_WARMUP_PROMPT ?? suite.warmup.userPrompt,
        systemPrompt:suite.warmup.systemPrompt
      });
      console.log('WARMUP: captured; metrics excluded from evaluation');
    }
    const messages = [...(systemPrompt ? [{ role:'system', content:systemPrompt.content }] : []), { role:'user', content:prompt }];
    const sampler = shouldSampleHost() ? startHostMetricsSampler({ intervalMs:sampleInterval(), gpuCommand:get('--gpu-command') ?? process.env.GPU_COMMAND }) : null;
    try {
      queryResult = await queryModel({ target, input:{ messages }, onProgress:event => progressWriter?.update(event) });
    } finally {
      if (sampler) hostMetrics = await sampler.stop();
    }
    if (hostMetrics) Object.assign(queryResult.performance, pickHostPeaks(hostMetrics));
    response = queryResult.visibleResponse;
  } catch (error) {
    await progressWriter?.flush({ stage:'error', error:error.message, elapsedMs:Date.now() - startedAt });
    console.error(`Unable to query inference target: ${error.message}`);
    process.exit(1);
  }
} else {
  process.stdout.write(`${prompt}\n`);
  process.exit(0);
}

await progressWriter?.flush({ stage:'evaluating', elapsedMs:Date.now() - startedAt });
const jsonFile = get('--json') ?? (queryResult ? await defaultEvidencePath(file, target.model) : null);
if (jsonFile) await mkdir(dirname(resolve(jsonFile)), { recursive:true });
const evaluatorArguments = [fileURLToPath(new URL('./evaluate-result.mjs', import.meta.url)), file, ...(jsonFile ? ['--json', jsonFile] : [])];
const child = spawn(process.execPath, evaluatorArguments, { stdio:['pipe','inherit','inherit'] });
child.stdin.end(response);
child.on('exit', async code => {
  if (jsonFile) {
    let report = {};
    try { report = JSON.parse(await readFile(jsonFile, 'utf8')); } catch { /* evaluator may have failed before writing */ }
    report.schemaVersion = '1.1.0';
    report.suiteVersion = suite.suiteVersion;
    report.testFile = resolve(file);
    report.model = target?.model ?? null;
    report.response = response;
    report.visibleResponse = response;
    report.reasoningResponse = queryResult?.reasoningResponse ?? null;
    report.finishReason = queryResult?.finishReason ?? null;
    report.backendUsage = queryResult?.usage ?? null;
    report.performance = queryResult?.performance ?? emptyPerformance(Date.now() - startedAt);
    if (queryResult) {
      report.inference = {
        ...queryResult.inference,
        testFile:resolve(file),
        suiteVersion:suite.suiteVersion,
        systemPrompt,
        extractedTestPrompt:prompt,
        artifacts:await persistRawArtifacts(jsonFile, queryResult.rawBackendEvidence, 'inference')
      };
      if (hostMetrics) report.inference.hostMetrics = { ...pickHostPeaks(hostMetrics), sampleCount:hostMetrics.sampleCount };
    }
    if (warmup) {
      const raw = warmup.rawBackendEvidence;
      delete warmup.rawBackendEvidence;
      warmup.inference.artifacts = await persistRawArtifacts(jsonFile, raw, 'warmup');
      report.warmup = warmup;
    }
    await writeFile(jsonFile, JSON.stringify(report, null, 2));
    if (!get('--json') && queryResult) console.log(`Evidence: ${jsonFile}`);
  }
  await progressWriter?.flush({ stage:'completed', result:code === 0 ? 'pass' : 'fail', elapsedMs:Date.now() - startedAt });
  process.exit(code ?? 1);
});

async function resolveTarget() {
  if (process.env.AGENT_TEST_TARGET_JSON) return createTarget(JSON.parse(process.env.AGENT_TEST_TARGET_JSON));
  const targetEntries = get('--target') ? await loadTargetFile(get('--target')) : [{}];
  if (targetEntries.length !== 1) throw new Error('test.mjs single requires exactly one target in --target');
  const fromFile = targetEntries[0];
  const authentication = get('--auth-env') ? { type:'bearer', env:get('--auth-env') } : (fromFile.authentication ?? (process.env.OPENAI_API_KEY ? { type:'bearer', env:'OPENAI_API_KEY' } : null));
  const baseOverride = get('--url');
  const endpointOverride = get('--endpoint');
  return createTarget({
    ...fromFile,
    model:get('--model') ?? fromFile.model ?? process.env.MODEL ?? 'local-model',
    protocol:get('--protocol') ?? fromFile.protocol ?? 'openai-chat',
    baseUrl:endpointOverride ? null : (baseOverride ?? fromFile.baseUrl ?? fromFile.url),
    endpoint:baseOverride ? null : (endpointOverride ?? fromFile.endpoint),
    path:endpointOverride ? null : (get('--path') ?? fromFile.path),
    authentication,
    requestParameters:{ temperature:Number(process.env.TEMPERATURE ?? 0.1), ...(fromFile.requestParameters ?? {}), ...parseRequestParameters(get('--request-params')) }
  });
}

function shouldSampleHost() { return args.includes('--host-metrics') || process.env.AGENT_TEST_HOST_METRICS === '1'; }
function sampleInterval() { return Number(get('--sample-ms') ?? process.env.AGENT_TEST_SAMPLE_MS ?? 200); }
function pickHostPeaks(metrics) { return { peakSystemCpuPercent:metrics.peakSystemCpuPercent, peakSingleCoreCpuPercent:metrics.peakSingleCoreCpuPercent, peakGpuPercent:metrics.peakGpuPercent, peakVramMb:metrics.peakVramMb }; }
function readStdin() { return new Promise(resolveInput => { let value=''; process.stdin.setEncoding('utf8'); process.stdin.on('data', chunk => value += chunk).on('end', () => resolveInput(value)); }); }
async function defaultEvidencePath(testFile, model) {
  const id = createHash('sha256').update(`${new Date().toISOString()}\0${model}\0${testFile}`).digest('hex').slice(0, 12);
  const directory = fileURLToPath(new URL(`../results/single-${id}/`, import.meta.url));
  await mkdir(directory, { recursive:true });
  return resolve(directory, `${basename(testFile, extname(testFile))}.json`);
}
async function persistRawArtifacts(jsonFile, evidence, label) {
  if (!evidence) return {};
  const artifact = resolve(dirname(resolve(jsonFile)), `${basename(jsonFile, extname(jsonFile))}.${label}.raw.txt`);
  await writeFile(artifact, evidence.body ?? '');
  return { rawBackendResponse:basename(artifact), contentType:evidence.contentType ?? null };
}
function emptyPerformance(totalTimeMs) {
  return { promptTokens:null, outputTokens:null, totalTokens:null, tokensPerSecond:null, timeToFirstVisibleTokenMs:null, timeToFirstGeneratedTokenMs:null, totalTimeMs, peakSystemCpuPercent:null, peakSingleCoreCpuPercent:null, peakGpuPercent:null, peakVramMb:null };
}
