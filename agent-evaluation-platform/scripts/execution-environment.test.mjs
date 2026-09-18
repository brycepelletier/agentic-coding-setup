import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { executeAgentTool, executionContractFor, executionTargetId, loadExecutionContracts, prepareExecutionEnvironment, validateLevel5Evidence, validateTaskExecution } from './execution-environment.mjs';

const entry=fileURLToPath(new URL('../test.mjs',import.meta.url));
const level1=fileURLToPath(new URL('../test/legacy/level-1-basic-authority.md',import.meta.url));
const level5=fileURLToPath(new URL('../test/legacy/level-5-repository-discovery.md',import.meta.url));
const controlledTestTempRoot = fileURLToPath(new URL('../.test-temp/', import.meta.url));
await mkdir(controlledTestTempRoot, { recursive:true });

test('model-only Levels 1-4 remain outside the agent execution boundary',() => {
  assert.equal(executionContractFor({ tests:{} },level1).mode,'model-inference');
});

test('execution workspace identifiers are short, stable, and do not expose full model IDs',() => {
  const target={model:'qwen3.6-40b-claude-4.6-opus-deckard-heretic-uncensored-thinking-neo-code-di-imatrix-max@iq3_m',protocol:'openai-chat'};
  const first=executionTargetId('run-id',target);
  assert.equal(first,executionTargetId('run-id',target));
  assert.match(first,/^target-[a-f0-9]{12}$/);
  assert.equal(first.includes('qwen'),false);
});

test('a valid environment with missing candidate evidence is blocked, while weighted fallback is provenance-tagged',async()=>{
  const config=await loadExecutionContracts();
  const contract=executionContractFor(config,'level-6-architecture-reconstruction.md');
  const directory=await mkdtemp(join(tmpdir(),'agent-prerequisite-'));
  try {
    const strict=await prepareExecutionEnvironment({config,contract,workspace:join(directory,'strict')});
    assert.equal(strict.valid,false);
    assert.equal(strict.outcome,'blocked_by_prerequisite');
    const fallback=await prepareExecutionEnvironment({config,contract,workspace:join(directory,'fallback'),allowReferenceFallback:true});
    assert.equal(fallback.valid,true);
    assert.equal(fallback.evidenceSource,'reference_fallback');
    assert.equal(fallback.dependencyFallback,true);
    assert.deepEqual(fallback.toolNames,[]);
    assert.match(fallback.priorEvidence.sha256,/^[a-f0-9]{64}$/);
  } finally { await rm(directory,{recursive:true,force:true}); }
});

test('Level 7 remains read-only and Level 8 permits only the bounded implementation with hidden acceptance',async()=>{
  const config=await loadExecutionContracts();
  const directory=await mkdtemp(join(tmpdir(),'agent-task-contract-'));
  try {
    const level7=await prepareExecutionEnvironment({config,contract:executionContractFor(config,'level-7-planning-only.md'),workspace:join(directory,'level7'),allowReferenceFallback:true});
    assert.equal(level7.valid,true,level7.reasons?.join('; '));
    const denied=await executeAgentTool({name:'write_file',arguments:{path:'task/telemetry-normalizer/src/normalize-metrics.mjs',content:'changed'}},level7);
    assert.equal(denied.result.ok,false);
    const plan='task/telemetry-normalizer/ISSUE.md\ntask/telemetry-normalizer/src/normalize-metrics.mjs\ntask/telemetry-normalizer/test/normalize-metrics.test.mjs';
    assert.deepEqual((await validateTaskExecution({environment:level7,level:7,toolEvidence:[],response:plan})).discrepancies,[]);

    const level8=await prepareExecutionEnvironment({config,contract:executionContractFor(config,'level-8-controlled-implementation.md'),workspace:join(directory,'level8'),allowReferenceFallback:true});
    assert.equal(level8.valid,true,level8.reasons?.join('; '));
    await executeAgentTool({name:'write_file',arguments:{path:'task/telemetry-normalizer/src/normalize-metrics.mjs',content:"import { writeFileSync } from 'node:fs'; writeFileSync('../escape','bad');"}},level8);
    const unsafeTests=await executeAgentTool({name:'run_test',arguments:{cwd:'task/telemetry-normalizer'}},level8);
    assert.equal(unsafeTests.result.ok,false);
    assert.match(unsafeTests.result.error,/outside the bounded task contract/);
    const implementation=`function value(raw) { if (typeof raw === 'string' && raw.trim() === '') return null; const number=Number(raw); return Number.isFinite(number)?number:null; }\nexport function normalizeMetrics(raw) { const input=raw&&typeof raw==='object'?raw:{}; const cpu=value(input.cpuPercent); const gpu=value(input.gpuPercent); const vram=value(input.vramMb); return {cpuPercent:cpu===null?null:Math.min(100,Math.max(0,cpu)),gpuPercent:gpu===null?null:Math.min(100,Math.max(0,gpu)),vramMb:vram===null?null:Math.max(0,vram)}; }\n`;
    const write=await executeAgentTool({name:'write_file',arguments:{path:'task/telemetry-normalizer/src/normalize-metrics.mjs',content:implementation}},level8);
    assert.equal(write.result.ok,true,write.result.error);
    const forbidden=await executeAgentTool({name:'write_file',arguments:{path:'task/telemetry-normalizer/README.md',content:'forbidden'}},level8);
    assert.equal(forbidden.result.ok,false);
    const tests=await executeAgentTool({name:'run_test',arguments:{cwd:'task/telemetry-normalizer'}},level8);
    assert.equal(tests.result.ok,true,tests.result.error);
    const response='Changed task/telemetry-normalizer/src/normalize-metrics.mjs and observed node --test pass.';
    const validation=await validateTaskExecution({environment:level8,level:8,toolEvidence:[tests],response});
    assert.deepEqual(validation.discrepancies,[]);
    assert.equal(validation.acceptance.passed,true);
    assert.deepEqual(validation.taskState.changedFiles,['src/normalize-metrics.mjs']);
  } finally { await rm(directory,{recursive:true,force:true}); }
});

test('missing required tools produces invalid_environment readiness',async() => {
  const result=await prepareExecutionEnvironment({ config:{ toolProfiles:{},fixtureRepositories:[] },contract:{ mode:'agent-execution',toolProfile:'missing',repositoryMutation:'prohibited' },workspace:'unused' });
  assert.equal(result.valid,false);
  assert.match(result.reasons.join(' '),/tool profile/i);
});

test('missing required fixtures produces invalid_environment readiness',async() => {
  const directory=await mkdtemp(join(tmpdir(),'agent-missing-fixture-'));
  try {
    const config={ executionVersion:'test',toolProfiles:{ readonly:['list_directory'] },fixtureRepositories:[{ name:'missing',url:join(directory,'does-not-exist'),commit:'0000000000000000000000000000000000000000' }] };
    const result=await prepareExecutionEnvironment({ config,contract:{ mode:'agent-execution',fixtures:'all',toolProfile:'readonly',repositoryMutation:'prohibited' },workspace:join(directory,'workspace'),fixtureSourceRoot:directory });
    assert.equal(result.valid,false);
    assert.match(result.reasons.join(' '),/execution environment setup failed/i);
  } finally { await rm(directory,{recursive:true,force:true}); }
});

test('real fixture paths validate, fabricated paths fail, and worktree verification is captured',async() => {
  const directory=await mkdtemp(join(controlledTestTempRoot,'agent-fixture-evidence-'));
  try {
    const sourceRoot=join(directory,'sources');
    const source=join(sourceRoot,'fixture-one');
    await mkdir(source,{recursive:true});
    await writeFile(join(source,'README.md'),'Current documentation.\n');
    await writeFile(join(source,'index.mjs'),'export const ready = true;\n');
    await writeFile(join(source,'package.json'),JSON.stringify({ scripts:{ test:'node --test' } }));
    git(source,['init']);git(source,['config','user.email','fixture@example.invalid']);git(source,['config','user.name','Fixture']);git(source,['add','.']);git(source,['commit','-m','TEST-1: fixture']);
    const commit=git(source,['rev-parse','HEAD']).trim();
    const config={ executionVersion:'test',toolProfiles:{ readonly:['list_directory','read_file','search_files','run_command'] },fixtureRepositories:[{ name:'fixture-one',url:source,commit }] };
    const contract={ mode:'agent-execution',fixtures:'all',toolProfile:'readonly',repositoryMutation:'prohibited' };
    const environment=await prepareExecutionEnvironment({ config,contract,workspace:join(directory,'workspace'),fixtureSourceRoot:sourceRoot });
    assert.equal(environment.valid,true,environment.reasons?.join('; '));
    const status=await executeAgentTool({ name:'run_command',arguments:{ cwd:'fixtures/fixture-one',command:'git',args:['status','--short'] } },environment);
    assert.equal(status.result.ok,true);
    assert.equal(status.result.output,'');
    const valid=await validateLevel5Evidence({ response:'Entry Points: `fixtures/fixture-one/index.mjs`\nScripts/Tools: `fixtures/fixture-one/package.json`',environment,toolEvidence:[status] });
    assert.equal(valid.discrepancies.length,0,JSON.stringify(valid.discrepancies));
    assert.equal(valid.postExecution.valid,true);
    assert.equal(valid.postExecution.fixtures[0].verification.command,'git status --short');
    const fabricated=await validateLevel5Evidence({ response:'Evidence Paths: `fixtures/fixture-one/invented.mjs`',environment,toolEvidence:[status] });
    assert.ok(fabricated.discrepancies.some(item=>item.classification==='FABRICATED REPOSITORY PATH'));
  } finally { await rm(directory,{recursive:true,force:true}); }
});

test('Level 5 requires worktree verification for every materialized fixture',async() => {
  const directory=await mkdtemp(join(controlledTestTempRoot,'agent-worktree-evidence-'));
  try {
    const sourceRoot=join(directory,'sources');
    const fixtures=[];
    for (const name of ['one','two']) {
      const source=join(sourceRoot,name);
      await mkdir(source,{recursive:true});
      await writeFile(join(source,'README.md'),`${name} fixture\n`);
      git(source,['init']);git(source,['config','user.email','fixture@example.invalid']);git(source,['config','user.name','Fixture']);git(source,['add','.']);git(source,['commit','-m',`TEST-1: ${name} fixture`]);
      fixtures.push({name,url:source,commit:git(source,['rev-parse','HEAD']).trim()});
    }
    const config={executionVersion:'test',toolProfiles:{readonly:['run_command']},fixtureRepositories:fixtures};
    const environment=await prepareExecutionEnvironment({config,contract:{mode:'agent-execution',fixtures:'all',toolProfile:'readonly',repositoryMutation:'prohibited'},workspace:join(directory,'workspace'),fixtureSourceRoot:sourceRoot});
    const status=await executeAgentTool({name:'run_command',arguments:{cwd:'fixtures/one',command:'git',args:['status','--short']}},environment);
    const result=await validateLevel5Evidence({response:'`fixtures/one/README.md` `fixtures/two/README.md`',environment,toolEvidence:[status]});
    assert.ok(result.discrepancies.some(item=>item.classification==='WORKTREE VERIFICATION MISSING'&&item.observed==='two'));
    assert.equal(result.discrepancies.some(item=>item.classification==='WORKTREE VERIFICATION MISSING'&&item.observed==='one'),false);
  } finally { await rm(directory,{recursive:true,force:true}); }
});

test('a refusal to invent unavailable fixture evidence is infrastructure-invalid, not a model failure',async() => {
  const directory=await mkdtemp(join(tmpdir(),'agent-refusal-environment-'));
  try {
    const response=join(directory,'response.txt');
    const output=join(directory,'result.json');
    await writeFile(response,'No fixture repositories were supplied. I will not invent paths.');
    const execution=spawnSync(process.execPath,[entry,'single',level5,'--response',response,'--json',output],{encoding:'utf8'});
    assert.equal(execution.status,2,execution.stderr);
    const result=JSON.parse(await readFile(output,'utf8'));
    assert.equal(result.result,'invalid_environment');
    assert.equal(result.hardFailureCount,0);
    assert.equal(result.visibleResponse,'No fixture repositories were supplied. I will not invent paths.');
    assert.equal(result.discrepancies.length,0);
  } finally { await rm(directory,{recursive:true,force:true}); }
});

function git(cwd,args) {
  const result=spawnSync('git',args,{cwd,encoding:'utf8',windowsHide:true});
  assert.equal(result.status,0,`${result.stderr}\n${result.stdout}`);
  return result.stdout;
}
