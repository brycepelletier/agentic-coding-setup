#!/usr/bin/env node
import { access, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import process from 'node:process';
import { basename, dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { warmupModel } from './llm-client.mjs';
import { createTarget, loadTargetFile, parseRequestParameters, publicTarget } from './inference-target.mjs';
import { loadSuiteConfig } from './suite-config.mjs';
import { canonicalId, legacyFilename } from './test-definitions.mjs';
import { expandLevels } from './level-selector.mjs';
import { showHelp, validateArguments, wantsHelp } from './cli-arguments.mjs';
import { loadPersistedReviews, loadScoringConfig, renderWeightedReport, scoreRun } from './weighted-scoring.mjs';
import { loadDashboardConfig } from './dashboard-config.mjs';
import { ensureDashboard } from './dashboard-launcher.mjs';
import { createLiveProgressWriter } from './live-progress.mjs';
import { writeJsonAtomically } from './atomic-write.mjs';
import { executionContractFor, executionTargetId, loadExecutionContracts } from './execution-environment.mjs';

const dir = new URL('../test/', import.meta.url);
const args = process.argv.slice(2);
const HELP = `
Usage:
  test.mjs run --targets TARGETS.json [options]
  test.mjs run --url URL --models LIST [options]
  test.mjs run --responses DIR [options]
  test.mjs run RESPONSES_DIR [options]

Run qualification tests for inference targets or evaluate saved responses.

Target options:
  --targets FILE         JSON target object, array, or { "targets": [...] }.
  --models LIST          Comma-separated model identifiers for shared target settings.
  --protocol NAME        Shared protocol; default openai-chat.
  --url URL              Shared base URL used with the protocol's request path.
  --endpoint URL         Shared complete endpoint; cannot combine with --path.
  --path PATH            Shared protocol path override.
  --auth-env NAME        Environment variable containing a bearer token.
  --request-params JSON  Shared additional protocol request parameters.

Run options:
  --responses DIR        Directory containing saved response text files.
  --levels LIST          Canonical IDs and ranges, for example L1,L2,L10-L13.
  --force                Continue later levels after a model fails.
  --weighted             Add weighted scoring without changing test execution.
  --scoring FILE         Versioned scoring configuration used with --weighted.
  --metrics FILE         Attach standalone metrics JSON to run.json.
  --host-metrics         Sample CPU/GPU/VRAM for each qualification request.
  --sample-ms MS         Host sampling interval; default 200.
  --gpu-command FILE     GPU sampler command; default nvidia-smi.
  --no-system-prompt     Do not apply the suite default system prompt.
  --json FILE            Write an additional aggregate JSON copy.
  --warmup-prompt TEXT   Override the per-model greeting.
  --dashboard-url URL    Public dashboard URL; default http://agent.eval.local:3000.
  --dashboard-port PORT  Dashboard HTTP port; default 3000.
  --no-dashboard         Do not print or start the live dashboard.
  --execution-config FILE Versioned Level 5-8 execution contracts.
  --fixture-source-root DIR Local pinned fixture clones; otherwise public remotes are used.
  --clear                Remove previous result-run folders before starting.
  -h, --help             Show this help.

Legacy --url/--models usage resolves to protocol openai-chat. Each live target
is warmed independently and warmup evidence is excluded from evaluation and averages.
`;
if (wantsHelp(args)) showHelp(HELP);
try {
  validateArguments(args, {
    valueOptions:['--targets','--models','--protocol','--url','--endpoint','--path','--auth-env','--request-params','--responses','--levels','--metrics','--sample-ms','--gpu-command','--json','--warmup-prompt','--scoring','--dashboard-url','--dashboard-port','--execution-config','--fixture-source-root'],
    flags:['--force','--weighted','--host-metrics','--no-system-prompt','--no-dashboard','--clear'], maxPositionals:1
  });
} catch (error) { showHelp(HELP, error.message); }
const getOption = name => { const index=args.findIndex(argument=>argument===name || argument.startsWith(`${name}=`)); return index<0 ? undefined : (args[index].includes('=') ? args[index].slice(name.length+1) : args[index+1]); };

const suite = await loadSuiteConfig();
const executionConfig = await loadExecutionContracts(getOption('--execution-config'));
const allFiles = suite.manifest;
const selector = getOption('--levels');
const selectedLevels = selector ? expandLevels(selector) : null;
const files = selectedLevels ? allFiles.filter(file => selectedLevels.has(file)) : allFiles;
const responseDir = getOption('--responses') ?? (!args[0]?.startsWith('--') ? args[0] : undefined);
if (getOption('--url') && getOption('--endpoint')) showHelp(HELP, 'Use either --url or --endpoint, not both');
if (getOption('--endpoint') && getOption('--path')) showHelp(HELP, '--endpoint is complete and cannot be combined with --path');
const liveRequested = Boolean(getOption('--targets') || getOption('--url') || getOption('--endpoint'));
if (!responseDir && !liveRequested) showHelp(HELP, 'Provide --targets, --url/--endpoint, or --responses');
if (responseDir && liveRequested) showHelp(HELP, 'Use either live target mode or saved-response mode, not both');
if (!files.length) showHelp(HELP, `No tests matched --levels ${selector}`);

const targets = liveRequested ? await resolveTargets() : [null];
const resultsRoot = process.env.AGENT_TEST_RESULTS_ROOT ? resolve(process.env.AGENT_TEST_RESULTS_ROOT) : fileURLToPath(new URL('../results/', import.meta.url));
if (args.includes('--clear')) await rm(resultsRoot, { recursive:true, force:true });
await mkdir(resultsRoot, { recursive:true });
const runStartedAt = new Date().toISOString();
const runId = createHash('sha256').update(JSON.stringify({ runStartedAt, args })).digest('hex').slice(0, 12);
const runDirectory = resolve(resultsRoot, runId);
await mkdir(runDirectory, { recursive:true });
const jsonPath = resolve(runDirectory, 'run.json');
const liveProgressPath = resolve(runDirectory, 'live-progress.json');
const jsonExportPath = getOption('--json');
const dashboardDisabled = args.includes('--no-dashboard');
const dashboard = await loadDashboardConfig({ url:getOption('--dashboard-url'), port:getOption('--dashboard-port') });
const aggregate = {
  runId,
  runDirectory,
  schemaVersion:'1.3.0',
  suiteVersion:suite.suiteVersion,
  generatedAt:new Date().toISOString(),
  startedAt:runStartedAt,
  updatedAt:runStartedAt,
  status:'running',
  options:{
    levels:selector ?? 'all', force:args.includes('--force'), responseDirectory:responseDir ?? null,
    targets:targets.filter(Boolean).map(publicTarget), metrics:getOption('--metrics') ?? null,
    hostMetrics:args.includes('--host-metrics'), systemPromptDisabled:args.includes('--no-system-prompt'),
    weighted:args.includes('--weighted'), scoring:getOption('--scoring') ?? null,
    dashboard:dashboardDisabled ? null : { url:dashboard.url, fallbackUrl:dashboard.fallbackUrl },
    execution:{ version:executionConfig.executionVersion,config:getOption('--execution-config') ?? 'config/execution-contracts.json',fixtureSourceRoot:getOption('--fixture-source-root') ?? process.env.AGENT_EVAL_FIXTURE_SOURCE_ROOT ?? null }
  },
  models:[]
};
await persistAggregate();
console.log(`Qualification run: ${runId}`);
if (!dashboardDisabled) {
  console.log(`Click here to view live updates: ${dashboard.url}`);
  if (dashboard.fallbackUrl !== dashboard.url) console.log(`Local fallback: ${dashboard.fallbackUrl}`);
  if (process.env.AGENT_EVAL_DASHBOARD_NO_SPAWN !== '1') {
    const dashboardProcess = await ensureDashboard({ resultsRoot, host:dashboard.bindHost, port:dashboard.port });
    if (dashboardProcess.status === 'unavailable') console.error(`Dashboard could not start on port ${dashboard.port}${dashboardProcess.reason ? `: ${dashboardProcess.reason}` : ''}; qualification will continue normally.`);
  }
}

let failed = false;
let infrastructureInvalid = false;
let prerequisiteBlocked = false;
let executionIncomplete = false;
for (const target of targets) {
  const model = target?.model ?? 'offline';
  console.log(`\nModel: ${model}`);
  const modelDirectory = resolve(runDirectory, safeModelDirectoryName(model));
  const executionWorkspace = resolve(runDirectory, '.workspaces', executionTargetId(runId,target?publicTarget(target):{model}));
  await mkdir(modelDirectory, { recursive:true });
  const modelReport = { model:target?.model ?? null, target:target ? publicTarget(target) : null, status:'running', stoppedAfter:null, activeTest:null, warmup:null, qualificationResults:[], performance:[] };
  aggregate.models.push(modelReport);
  let modelInfrastructureInvalid=false;
  let modelPrerequisiteBlocked=false;
  let modelExecutionIncomplete=false;
  const priorResults=new Map();
  await persistAggregate();
  if (target) {
    console.log('  Warmup — greeting and model load');
    const warmupPath = resolve(modelDirectory, 'warmup.json');
    const warmupProgress = createLiveProgressWriter(liveProgressPath, { runId, model, test:'warmup', level:'WARMUP' });
    warmupProgress.update({ stage:'warmup', elapsedMs:0 });
    try {
      modelReport.warmup = await warmupModel({
        target,
        prompt:getOption('--warmup-prompt') ?? process.env.QUALIFICATION_WARMUP_PROMPT ?? suite.warmup.userPrompt,
        systemPrompt:suite.warmup.systemPrompt,
        onProgress:event => warmupProgress.update({ ...event, stage:event.stage === 'streaming' ? 'warmup_streaming' : event.stage })
      });
      await warmupProgress.flush({ stage:'warmup_completed' });
      const raw = modelReport.warmup.rawBackendEvidence;
      delete modelReport.warmup.rawBackendEvidence;
      modelReport.warmup.inference.artifacts = await persistRawArtifact(modelDirectory, 'warmup.raw.txt', raw);
      await writeFile(warmupPath, JSON.stringify({ schemaVersion:'1.1.0', suiteVersion:suite.suiteVersion, model, ...modelReport.warmup }, null, 2));
      console.log('    READY: warmup captured; metrics excluded from evaluation and averages');
      await persistAggregate();
      await warmupProgress.clear();
    } catch (error) {
      await warmupProgress.flush({ stage:'error', error:error.message });
      failed = true;
      modelReport.status = 'warmup_failed';
      modelReport.stoppedAfter = 'warmup';
      modelReport.warmup = { kind:'warmup', includedInEvaluation:false, includedInAverages:false, capturedAt:new Date().toISOString(), target:publicTarget(target), response:null, performance:null, error:error.message };
      await writeFile(warmupPath, JSON.stringify({ schemaVersion:'1.1.0', suiteVersion:suite.suiteVersion, model, ...modelReport.warmup }, null, 2));
      console.error(`    WARMUP FAILED: ${error.message}; continuing with next model`);
      modelReport.qualificationResults = addSkippedLevels([], files, 'Not run because model warmup failed');
      await persistAggregate();
      await warmupProgress.clear();
      continue;
    }
  }

  for (const file of files) {
    const responseFile = responseDir && await firstExisting(responseDir, [`${file}.txt`, `${legacyFilename(file)?.replace('.md','.txt')}`]);
    if (responseFile) {
      try { await access(responseFile); }
      catch { console.log(`  SKIP ${file}: missing ${responseFile}`); continue; }
    }
    console.log(`  ${file} — ${suite.definitions.find(item=>item.id===file)?.name ?? file}`);
    modelReport.activeTest = { test:file, testId:file, level:file, startedAt:new Date().toISOString() };
    await persistAggregate();
    const command = [fileURLToPath(new URL('./run-test.mjs', import.meta.url)), file];
    command.push(...(responseFile ? ['--response', responseFile] : []));
    if (args.includes('--no-system-prompt')) command.push('--no-system-prompt');
    const perTestJson = resolve(modelDirectory, `${file}.json`);
    command.push('--json', perTestJson);
    if (getOption('--execution-config')) command.push('--execution-config',getOption('--execution-config'));
    if (getOption('--fixture-source-root')) command.push('--fixture-source-root',getOption('--fixture-source-root'));
    const executionContract=executionContractFor(executionConfig,file);
    const priorResultFile=executionContract.priorEvidence ? priorResults.get(executionContract.priorEvidence) : null;
    const environment = target ? {
      AGENT_TEST_PARENT_WARMED:'1',
      AGENT_TEST_TARGET_JSON:JSON.stringify(target),
      AGENT_TEST_PROGRESS_FILE:liveProgressPath,
      AGENT_TEST_RUN_ID:runId,
      AGENT_TEST_MODEL:model,
      AGENT_TEST_EXECUTION_WORKSPACE:executionWorkspace,
      ...(priorResultFile ? { AGENT_TEST_PRIOR_RESULT_FILE:priorResultFile } : {}),
      ...(args.includes('--force')&&args.includes('--weighted') ? { AGENT_TEST_ALLOW_REFERENCE_FALLBACK:'1' } : {}),
      ...(getOption('--fixture-source-root') ? { AGENT_EVAL_FIXTURE_SOURCE_ROOT:getOption('--fixture-source-root') } : {}),
      ...(args.includes('--host-metrics') ? { AGENT_TEST_HOST_METRICS:'1' } : {}),
      ...(getOption('--sample-ms') ? { AGENT_TEST_SAMPLE_MS:getOption('--sample-ms') } : {}),
      ...(getOption('--gpu-command') ? { GPU_COMMAND:getOption('--gpu-command') } : {})
    } : { AGENT_TEST_PROGRESS_FILE:liveProgressPath, AGENT_TEST_RUN_ID:runId, AGENT_TEST_MODEL:model };
    const code = await run(command, '    ', environment);
    const result = await readJson(perTestJson);
    // Keep a legacy-named sidecar for historical readers; canonical L<n>.json
    // remains the primary new-run artifact.
    if (legacyFilename(file) && result) {
      const legacyBase = legacyFilename(file).replace(/\.md$/i, '');
      const legacyReport = JSON.parse(JSON.stringify(result));
      const rawName = result.inference?.artifacts?.rawBackendResponse;
      if (rawName) {
        const legacyRaw = `${legacyBase}.inference.raw.txt`;
        await writeFile(resolve(modelDirectory, legacyRaw), await readFile(resolve(modelDirectory, rawName)));
        legacyReport.inference.artifacts.rawBackendResponse = legacyRaw;
      }
      await writeFile(resolve(modelDirectory, `${legacyBase}.json`), JSON.stringify(legacyReport, null, 2));
    }
    const outcome=result?.result ?? (code === 0 ? 'pass' : 'fail');
    const nonScoredExecution=['invalid_environment','blocked_by_prerequisite','execution_incomplete'];
    const notes=nonScoredExecution.includes(outcome) ? (result?.infrastructure?.reasons ?? []).join('; ') : (result?.rubricReviewRequired ? 'RUBRIC REVIEW REQUIRED' : '');
    modelReport.qualificationResults.push({ test:file, level:levelOf(file), result:outcome, notes, rubricReviewRequired:Boolean(result?.rubricReviewRequired), discrepancies:result?.discrepancies ?? [], performance:nonScoredExecution.includes(outcome)?null:(result?.performance ?? null), infrastructure:result?.infrastructure ?? null, evidenceSource:result?.evidenceSource??result?.executionEvidence?.evidenceSource??null,dependencyFallback:Boolean(result?.dependencyFallback??result?.executionEvidence?.dependencyFallback), executionEvidence:result?.executionEvidence ? { valid:result.executionEvidence.valid,executionVersion:result.executionEvidence.executionVersion,taskState:result.executionEvidence.taskState,acceptance:result.executionEvidence.acceptance,toolCalls:result.executionEvidence.toolCalls,termination:result.executionEvidence.termination??null } : null, evidence:relativeEvidence(modelDirectory, perTestJson, result) });
    priorResults.set(file,perTestJson);
    modelReport.activeTest = null;
    if (!nonScoredExecution.includes(outcome) && result?.performance) modelReport.performance.push({ level:levelOf(file), ...result.performance });
    await persistAggregate();
    await rm(liveProgressPath, { force:true });
    if (outcome === 'invalid_environment') {
      infrastructureInvalid=true;
      modelInfrastructureInvalid=true;
      console.error(`  INVALID ENVIRONMENT: ${file} was not scored for ${model}`);
      continue;
    }
    if (outcome === 'blocked_by_prerequisite') {
      prerequisiteBlocked=true; modelPrerequisiteBlocked=true;
      console.error(`  BLOCKED BY PREREQUISITE: ${file} was not scored for ${model}`);
      continue;
    }
    if (outcome === 'execution_incomplete') {
      executionIncomplete=true; modelExecutionIncomplete=true;
      console.error(`  EXECUTION INCOMPLETE: ${file} ended before a final answer for ${model}`);
      continue;
    }
    if (code === 0) continue;
    failed = true;
    modelReport.status = 'failed';
    modelReport.stoppedAfter = levelOf(file);
    if (!args.includes('--force')) {
      console.error(`  FAIL FAST: stopping ${model} after ${file}; continuing with next model`);
      break;
    }
  }
  modelReport.qualificationResults = addSkippedLevels(modelReport.qualificationResults, files);
  modelReport.activeTest = null;
  if (modelReport.status === 'running') modelReport.status = modelExecutionIncomplete?'execution_incomplete':modelPrerequisiteBlocked?'blocked_by_prerequisite':modelInfrastructureInvalid?'incomplete_environment':'completed';
  await persistAggregate();
}

if (getOption('--metrics')) aggregate.metrics = await readJson(getOption('--metrics'));
if (args.includes('--weighted')) {
  const scoringPath = getOption('--scoring') ? resolve(getOption('--scoring')) : fileURLToPath(new URL('../config/scoring.json', import.meta.url));
  const scoring = await loadScoringConfig(scoringPath);
  const reviews = await loadPersistedReviews(runDirectory, aggregate);
  aggregate.weighted = scoreRun(aggregate, scoring, reviews);
  aggregate.weighted.scoringConfiguration = scoringPath;
  await writeFile(resolve(runDirectory, 'weighted-results.json'), JSON.stringify(aggregate.weighted, null, 2));
  await writeFile(resolve(runDirectory, 'weighted-summary.md'), renderWeightedReport(aggregate.weighted, scoring));
}
aggregate.status = failed?'completed_with_failures':executionIncomplete?'completed_execution_incomplete':prerequisiteBlocked?'completed_blocked_by_prerequisite':infrastructureInvalid?'completed_incomplete_environment':'completed';
aggregate.completedAt = new Date().toISOString();
await persistAggregate();
if (jsonExportPath && resolve(jsonExportPath) !== jsonPath) {
  await mkdir(dirname(resolve(jsonExportPath)), { recursive:true });
  await writeFile(jsonExportPath, JSON.stringify(aggregate, null, 2));
}
await run([fileURLToPath(new URL('./finalize-run.mjs', import.meta.url)), jsonPath, '--output', resolve(runDirectory, 'qualification-summary.md'), ...(args.includes('--weighted') ? ['--weighted'] : [])]);
process.exitCode = failed?1:executionIncomplete?4:prerequisiteBlocked?3:infrastructureInvalid?2:0;

async function resolveTargets() {
  const cliAuthentication = getOption('--auth-env') ? { type:'bearer', env:getOption('--auth-env') } : undefined;
  const defaultAuthentication = process.env.OPENAI_API_KEY ? { type:'bearer', env:'OPENAI_API_KEY' } : undefined;
  const cliRequestParameters = parseRequestParameters(getOption('--request-params'));
  const shared = {
    protocol:getOption('--protocol'), baseUrl:getOption('--url'), endpoint:getOption('--endpoint'), path:getOption('--path'),
    authentication:cliAuthentication ?? defaultAuthentication,
    requestParameters:{ temperature:Number(process.env.TEMPERATURE ?? 0.1), ...cliRequestParameters }
  };
  if (getOption('--targets')) return (await loadTargetFile(getOption('--targets'))).map(raw => createTarget({
    ...raw,
    protocol:getOption('--protocol') ?? raw.protocol,
    baseUrl:getOption('--endpoint') ? null : (getOption('--url') ?? raw.baseUrl ?? raw.url),
    endpoint:getOption('--url') ? null : (getOption('--endpoint') ?? raw.endpoint),
    path:getOption('--endpoint') ? null : (getOption('--path') ?? raw.path),
    requestParameters:{ temperature:Number(process.env.TEMPERATURE ?? 0.1), ...(raw.requestParameters ?? {}), ...cliRequestParameters },
    authentication:cliAuthentication ?? raw.authentication ?? defaultAuthentication
  }));
  const models = (getOption('--models') ?? process.env.MODEL ?? 'local-model').split(',').filter(Boolean);
  return models.map(model => createTarget({ ...shared, model, protocol:shared.protocol ?? 'openai-chat' }));
}
function levelOf(file) { return canonicalId(file) ?? file; }
async function firstExisting(directory, names) { for (const name of names.filter(Boolean)) { const candidate=resolve(directory,name); try { await access(candidate); return candidate; } catch {} } return null; }
function run(command, indent = '', extraEnvironment = {}) { return new Promise(resolveRun => { const child=spawn(process.execPath, command, { stdio:['inherit','pipe','pipe'], shell:false, env:{ ...process.env, ...extraEnvironment } }); pipeIndented(child.stdout, process.stdout, indent); pipeIndented(child.stderr, process.stderr, indent); child.on('exit', code => resolveRun(code ?? 1)); }); }
function pipeIndented(source, destination, indent) { let pending=''; source.setEncoding('utf8'); source.on('data', chunk => { pending+=chunk; const lines=pending.split(/\r?\n/); pending=lines.pop() ?? ''; for (const line of lines) destination.write(`${indent}${line}\n`); }); source.on('end', () => { if (pending) destination.write(`${indent}${pending}\n`); }); }
function safeModelDirectoryName(model) { return model.replace(/[\\/]+/g, '__').replace(/[<>:"|?*\u0000-\u001F]/g, '_').replace(/\s+/g, '-').slice(0,180) || 'unnamed-model'; }
async function readJson(file) { try { return JSON.parse(await readFile(file, 'utf8')); } catch { return null; } }
async function persistRawArtifact(directory, name, evidence) { if (!evidence) return {}; const path=resolve(directory, name); await writeFile(path, evidence.body ?? ''); return { rawBackendResponse:basename(path), contentType:evidence.contentType ?? null }; }
function relativeEvidence(directory, jsonFile, result) { return { resultFile:basename(jsonFile), rawBackendResponse:result?.inference?.artifacts?.rawBackendResponse ?? null, directory:basename(directory) }; }
function addSkippedLevels(results, selectedFiles, reason='Not run because the response was unavailable or the model failed earlier') { const seen=new Set(results.map(result=>result.test)); return results.concat(selectedFiles.filter(file=>!seen.has(file)).map(file=>({ test:file, level:levelOf(file), result:'skipped', notes:reason, discrepancies:[], performance:null }))); }
async function persistAggregate() { aggregate.updatedAt = new Date().toISOString(); await writeJsonAtomically(jsonPath, aggregate); }
