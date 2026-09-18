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
import { extractSystemPrompt, loadCanonicalTest, loadSuiteConfig } from './suite-config.mjs';
import { showHelp, validateArguments, wantsHelp } from './cli-arguments.mjs';
import { createLiveProgressWriter } from './live-progress.mjs';
import { assessImplementation } from './implementation-assessment.mjs';
import { executeAgentQualification, ExecutionIncompleteError, InvalidAgentEnvironmentError } from './agent-execution.mjs';
import { blockedByPrerequisite, executionContractFor, executionIncomplete, invalidEnvironment, loadExecutionContracts, prepareExecutionEnvironment, validateExecutionEvidence } from './execution-environment.mjs';

const [, , file, ...args] = process.argv;
const cliArgs = process.argv.slice(2);
const HELP = `
Usage:
  test.mjs single L1 --target TARGET.json [options]
  test.mjs single L1 --url URL [--model MODEL] [options]
  test.mjs single L1 --response FILE|- [options]
  test.mjs single L1

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
  --execution-config FILE  Versioned Level 5-8 execution contracts.
  --execution-workspace DIR Controlled workspace for agent-execution tests.
  --fixture-source-root DIR Optional local clones used instead of network fixture clones.
  --prior-result FILE    Prior-level evidence required by dependent agent tests.
  -h, --help             Show this help.

Environment:
  MODEL, OPENAI_API_KEY, TEMPERATURE, QUALIFICATION_WARMUP_PROMPT

Every direct live invocation warms independently. Warmup messages and metrics
remain isolated from the qualification request and its averages.
`;
if (wantsHelp(cliArgs)) showHelp(HELP);
try {
  validateArguments(cliArgs, {
    valueOptions:['--target','--model','--protocol','--url','--endpoint','--path','--auth-env','--request-params','--response','--json','--warmup-prompt','--sample-ms','--gpu-command','--execution-config','--execution-workspace','--fixture-source-root','--prior-result'],
    flags:['--no-system-prompt','--host-metrics'], maxPositionals:1
  });
} catch (error) { showHelp(HELP, error.message); }
const get = name => { const index=args.findIndex(value=>value===name || value.startsWith(`${name}=`)); return index<0 ? undefined : (args[index].includes('=') ? args[index].slice(name.length+1) : args[index+1]); };
if (!file || file.startsWith('-')) showHelp(HELP, 'Provide a canonical test ID (L1-L13) or compatible Markdown test file');
if (get('--url') && get('--endpoint')) showHelp(HELP, 'Use either --url or --endpoint, not both');
if (get('--endpoint') && get('--path')) showHelp(HELP, '--endpoint is complete and cannot be combined with --path');
const hasLiveTarget = Boolean(get('--target') || get('--url') || get('--endpoint') || process.env.AGENT_TEST_TARGET_JSON);
if (get('--response') && hasLiveTarget) showHelp(HELP, 'Use either --response or a live inference target, not both');

const suite = await loadSuiteConfig();
const canonicalTest = await loadCanonicalTest(file);
const canonicalId = canonicalTest.id ?? basename(file);
const executionConfig = await loadExecutionContracts(get('--execution-config'));
const executionContract = executionContractFor(executionConfig, canonicalId);
const sourcePath = canonicalTest.path ?? file;
const source = canonicalTest.id ? canonicalTest.definition.prompt : await readFile(sourcePath, 'utf8');
const prompt = canonicalTest.definition.prompt || source.match(/<!-- AGENT-TEST:PROMPT:BEGIN -->([\s\S]*?)<!-- AGENT-TEST:PROMPT:END -->/)?.[1]?.trim();
if (!prompt) throw new Error(`Missing prompt markers in ${file}`);
const systemPrompt = extractSystemPrompt(source, { ...suite, defaultSystemPrompt: canonicalTest.definition.systemPrompt ? { ...suite.defaultSystemPrompt, content:canonicalTest.definition.systemPrompt } : suite.defaultSystemPrompt }, { disabled:args.includes('--no-system-prompt') });
const responseFile = get('--response');
let response;
let queryResult = null;
let warmup = null;
let target = null;
let hostMetrics = null;
let executionEnvironment = null;
const startedAt = Date.now();
const progressWriter = process.env.AGENT_TEST_PROGRESS_FILE ? createLiveProgressWriter(process.env.AGENT_TEST_PROGRESS_FILE, {
  runId:process.env.AGENT_TEST_RUN_ID ?? null,
  model:process.env.AGENT_TEST_MODEL ?? null,
  test:basename(file),
    level:canonicalId
}) : null;
progressWriter?.update({ stage:'preparing', elapsedMs:0 });

if (responseFile) {
  response = responseFile === '-' ? await readStdin() : await readFile(responseFile, 'utf8');
  if (executionContract.mode === 'agent-execution') await finishInvalidEnvironment(['saved responses do not contain required workspace/tool-call evidence']);
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
    if (executionContract.mode === 'agent-execution') {
      const workspace=get('--execution-workspace') ?? process.env.AGENT_TEST_EXECUTION_WORKSPACE ?? await defaultExecutionWorkspace(file,target.model);
      executionEnvironment=await prepareExecutionEnvironment({
        config:executionConfig,contract:executionContract,workspace,
        fixtureSourceRoot:get('--fixture-source-root') ?? process.env.AGENT_EVAL_FIXTURE_SOURCE_ROOT,
        priorResultFile:get('--prior-result') ?? process.env.AGENT_TEST_PRIOR_RESULT_FILE,
        allowReferenceFallback:process.env.AGENT_TEST_ALLOW_REFERENCE_FALLBACK==='1'
      });
      if (!executionEnvironment.valid) await finishExecutionOutcome(executionEnvironment.outcome ?? 'invalid_environment',executionEnvironment.reasons);
    }
    const sampler = shouldSampleHost() ? startHostMetricsSampler({ intervalMs:sampleInterval(), gpuCommand:get('--gpu-command') ?? process.env.GPU_COMMAND }) : null;
    try {
      queryResult = executionContract.mode === 'agent-execution'
        ? await executeAgentQualification({ target,messages,environment:executionEnvironment,onProgress:event=>progressWriter?.update(event) })
        : await queryModel({ target, input:{ messages }, onProgress:event => progressWriter?.update(event) });
    } finally {
      if (sampler) hostMetrics = await sampler.stop();
    }
    if (hostMetrics) Object.assign(queryResult.performance, pickHostPeaks(hostMetrics));
    response = queryResult.visibleResponse;
  } catch (error) {
    if (error instanceof InvalidAgentEnvironmentError) await finishExecutionOutcome('invalid_environment',[error.message]);
    if (error instanceof ExecutionIncompleteError) await finishExecutionOutcome('execution_incomplete',[error.message],error.evidence);
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
const evaluatorArguments = [fileURLToPath(new URL('./evaluate-result.mjs', import.meta.url)), sourcePath, ...(jsonFile ? ['--json', jsonFile] : [])];
const child = spawn(process.execPath, evaluatorArguments, { stdio:['pipe','inherit','inherit'] });
child.stdin.end(response);
child.on('exit', async code => {
  let finalCode=code ?? 1;
  if (jsonFile) {
    let report = {};
    try { report = JSON.parse(await readFile(jsonFile, 'utf8')); } catch { /* evaluator may have failed before writing */ }
    report.schemaVersion = '1.3.0';
    report.suiteVersion = suite.suiteVersion;
    report.testFile = canonicalTest.path ?? resolve(file);
    report.testId = canonicalId;
    report.testName = canonicalTest.definition.name;
    report.legacyTest = canonicalTest.legacy;
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
        testFile:canonicalTest.path ?? resolve(file),
        suiteVersion:suite.suiteVersion,
        systemPrompt,
        extractedTestPrompt:prompt,
        artifacts:await persistRawArtifacts(jsonFile, queryResult.rawBackendEvidence, 'inference')
      };
      if (hostMetrics) report.inference.hostMetrics = { ...pickHostPeaks(hostMetrics), sampleCount:hostMetrics.sampleCount };
    }
    if (executionEnvironment?.valid) {
      let validation;
      try {
        validation=await validateExecutionEvidence({testId:canonicalId,response,environment:executionEnvironment,toolEvidence:queryResult?.agentExecution?.toolEvidence ?? []});
      } catch (error) {
        validation={discrepancies:[],postExecution:{valid:false,error:error.message},taskState:null,acceptance:null,citations:[]};
        report.result='execution_incomplete';
        report.rubricReviewRequired=false;
        report.infrastructure={valid:false,outcome:'execution_incomplete',reasons:[`Post-execution validation failed: ${error.message}`]};
        finalCode=2;
      }
      report.discrepancies=[...(report.discrepancies ?? []),...validation.discrepancies];
      report.hardFailureCount=report.discrepancies.filter(item=>item.severity==='hard').length;
      if (report.hardFailureCount) { report.result='fail'; report.rubricReviewRequired=false; finalCode=1; }
      report.executionEvidence={
        valid:validation.postExecution?.valid && !validation.discrepancies.some(item=>item.severity==='hard'),
        executionVersion:executionConfig.executionVersion,contract:executionContract,
        workspace:executionEnvironment.workspace,fixtures:executionEnvironment.manifest.fixtures,
        task:executionEnvironment.task ? {name:executionEnvironment.task.name,workspacePath:executionEnvironment.task.workspacePath,mode:executionEnvironment.task.mode,permittedWrites:executionEnvironment.task.permittedWrites,baseline:executionEnvironment.task.baseline,hiddenAcceptance:executionEnvironment.task.hiddenAcceptance,visibleTestCommand:executionEnvironment.task.visibleTestCommand} : null,
        evidenceSource:executionEnvironment.evidenceSource ?? null,dependencyFallback:Boolean(executionEnvironment.dependencyFallback),priorEvidence:executionEnvironment.priorEvidence ? {sha256:executionEnvironment.priorEvidence.sha256,sourceFile:executionEnvironment.priorEvidence.sourceFile,artifactType:executionEnvironment.priorEvidence.artifactType} : null,
        toolCalls:queryResult?.agentExecution?.toolEvidence ?? [],citations:validation.citations,postExecution:validation.postExecution,taskState:validation.taskState ?? null,acceptance:validation.acceptance ?? null
      };
      report.evidenceSource=executionEnvironment.evidenceSource ?? null;
      report.dependencyFallback=Boolean(executionEnvironment.dependencyFallback);
      Object.assign(report,assessImplementation(report));
      if (report.result === 'execution_incomplete') finalCode=2;
      else if (report.result === 'fail') finalCode=1;
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
  await progressWriter?.flush({ stage:'completed', result:finalCode === 0 ? 'pass' : 'fail', elapsedMs:Date.now() - startedAt });
  process.exit(finalCode);
});

async function finishInvalidEnvironment(reasons) { return finishExecutionOutcome('invalid_environment',reasons); }
async function finishExecutionOutcome(kind,reasons,partialEvidence=null) {
  const factory=kind==='blocked_by_prerequisite'?blockedByPrerequisite:kind==='execution_incomplete'?executionIncomplete:invalidEnvironment;
  const outcome=factory({ testFile:file,contract:executionContract,reasons,executionVersion:executionConfig.executionVersion,termination:partialEvidence?.reason,evidence:partialEvidence?{turnCount:partialEvidence.turns?.length??0,toolCallCount:partialEvidence.toolEvidence?.length??0}:null });
  const jsonFile=get('--json');
  const lastResult=partialEvidence?.lastResult ?? partialEvidence?.turns?.at?.(-1) ?? null;
  const partialResponse=lastResult?.visibleResponse ?? response ?? null;
  const report={
    schemaVersion:'1.3.0',suiteVersion:suite.suiteVersion,testFile:resolve(file),test:resolve(file),
    level:canonicalId, testId:canonicalId, testName:canonicalTest.definition.name, legacyTest:canonicalTest.legacy,model:target?.model ?? process.env.AGENT_TEST_MODEL ?? null,
    response:partialResponse,visibleResponse:partialResponse,reasoningResponse:lastResult?.reasoningResponse ?? null,finishReason:lastResult?.finishReason ?? null,backendUsage:lastResult?.usage ?? null,
    performance:emptyPerformance(Date.now()-startedAt),...outcome
  };
  report.evidenceSource=executionEnvironment?.evidenceSource??(kind==='blocked_by_prerequisite'?'candidate':null);
  report.dependencyFallback=Boolean(executionEnvironment?.dependencyFallback);
  if (partialEvidence) report.executionEvidence={valid:false,executionVersion:executionConfig.executionVersion,contract:executionContract,evidenceSource:executionEnvironment?.evidenceSource??null,dependencyFallback:Boolean(executionEnvironment?.dependencyFallback),turns:partialEvidence.turns??[],toolCalls:partialEvidence.toolEvidence??[],termination:{reason:partialEvidence.reason,error:partialEvidence.error??null}};
  if (jsonFile) {
    await mkdir(dirname(resolve(jsonFile)),{recursive:true});
    if (partialEvidence?.raw) report.inference={artifacts:await persistRawArtifacts(jsonFile,{body:partialEvidence.raw.join('\n\n'),contentType:'application/x-agent-execution-transcript'},'inference')};
    await writeFile(jsonFile,JSON.stringify(report,null,2));
  }
  console.log(`LEVEL ${report.level}: ${kind.replaceAll('_',' ').toUpperCase()}`);
  for (const reason of outcome.infrastructure.reasons) console.log(`  - ${reason}`);
  await progressWriter?.flush({ stage:kind,result:kind,reasons:outcome.infrastructure.reasons,elapsedMs:Date.now()-startedAt });
  process.exit(kind==='invalid_environment'?2:kind==='blocked_by_prerequisite'?3:4);
}

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
async function defaultExecutionWorkspace(testFile, model) {
  const id=createHash('sha256').update(`${model}\0${testFile}`).digest('hex').slice(0,12);
  const directory=fileURLToPath(new URL(`../results/execution-workspaces/${id}/`,import.meta.url));
  await mkdir(directory,{recursive:true});
  return directory;
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
