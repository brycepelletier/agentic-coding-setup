import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { executeAgentTool, executionContractFor, prepareExecutionEnvironment, validateLevel5Evidence } from './execution-environment.mjs';

const entry=fileURLToPath(new URL('../test.mjs',import.meta.url));
const level1=fileURLToPath(new URL('../test/level-1-basic-authority.md',import.meta.url));
const level5=fileURLToPath(new URL('../test/level-5-repository-discovery.md',import.meta.url));

test('model-only Levels 1-4 remain outside the agent execution boundary',() => {
  assert.equal(executionContractFor({ tests:{} },level1).mode,'model-inference');
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
    const result=await prepareExecutionEnvironment({ config,contract:{ mode:'agent-execution',toolProfile:'readonly',repositoryMutation:'prohibited' },workspace:join(directory,'workspace'),fixtureSourceRoot:directory });
    assert.equal(result.valid,false);
    assert.match(result.reasons.join(' '),/fixture materialization failed/i);
  } finally { await rm(directory,{recursive:true,force:true}); }
});

test('real fixture paths validate, fabricated paths fail, and worktree verification is captured',async() => {
  const directory=await mkdtemp(join(tmpdir(),'agent-fixture-evidence-'));
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
    const contract={ mode:'agent-execution',toolProfile:'readonly',repositoryMutation:'prohibited' };
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
  const directory=await mkdtemp(join(tmpdir(),'agent-worktree-evidence-'));
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
    const environment=await prepareExecutionEnvironment({config,contract:{mode:'agent-execution',toolProfile:'readonly',repositoryMutation:'prohibited'},workspace:join(directory,'workspace'),fixtureSourceRoot:sourceRoot});
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
