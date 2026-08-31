import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,readFile,rm,writeFile,mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { invalidateHistoricalResults } from './invalidate-environment-results.mjs';

test('historical agent tests become invalid_environment while exact responses remain unchanged',async()=>{
  const root=await mkdtemp(join(tmpdir(),'agent-eval-history-'));
  try {
    const runDirectory=join(root,'run-1');
    const modelDirectory=join(runDirectory,'model');
    await mkdir(modelDirectory,{recursive:true});
    const response='No fixture repositories were supplied.\r\n';
    const artifact={ result:'fail',response,visibleResponse:response,reasoningResponse:'exact reasoning',hardFailureCount:2,discrepancies:[{severity:'hard'}],inference:{response:{visible:response,reasoning:'exact reasoning'} } };
    await writeFile(join(modelDirectory,'level-5-repository-discovery.json'),JSON.stringify(artifact,null,2));
    await writeFile(join(modelDirectory,'level-5-repository-discovery.inference.raw.txt'),'RAW\r\nSTREAM');
    const run={ runId:'run-1',status:'running',models:[{model:'google',qualificationResults:[
      {test:'level-4-long-context.md',level:'4',result:'pass',discrepancies:[]},
      {test:'level-5-repository-discovery.md',level:'5',result:'fail',hardFailureCount:2,discrepancies:[{severity:'hard'}],evidence:{directory:'model',resultFile:'level-5-repository-discovery.json',rawBackendResponse:'level-5-repository-discovery.inference.raw.txt'}}
    ]}]};
    await writeFile(join(runDirectory,'run.json'),JSON.stringify(run,null,2));
    const beforeRaw=await readFile(join(modelDirectory,'level-5-repository-discovery.inference.raw.txt'),'utf8');
    const summary=await invalidateHistoricalResults(runDirectory);
    assert.equal(summary.invalidatedCount,1);
    const migrated=JSON.parse(await readFile(join(modelDirectory,'level-5-repository-discovery.json'),'utf8'));
    assert.equal(migrated.result,'invalid_environment');
    assert.equal(migrated.response,response);
    assert.equal(migrated.visibleResponse,response);
    assert.equal(migrated.reasoningResponse,'exact reasoning');
    assert.deepEqual(migrated.inference.response,artifact.inference.response);
    assert.equal(migrated.hardFailureCount,0);
    assert.deepEqual(migrated.discrepancies,[]);
    assert.equal(migrated.supersededEvaluation.result,'fail');
    assert.equal(await readFile(join(modelDirectory,'level-5-repository-discovery.inference.raw.txt'),'utf8'),beforeRaw);
    const aggregate=JSON.parse(await readFile(join(runDirectory,'run.json'),'utf8'));
    assert.equal(aggregate.models[0].qualificationResults[0].result,'pass');
    assert.equal(aggregate.models[0].qualificationResults[1].result,'invalid_environment');
    assert.equal(aggregate.status,'completed_incomplete_environment');
    const audit=JSON.parse(await readFile(join(runDirectory,'environment-validity.json'),'utf8'));
    assert.equal(audit.invalidatedCount,1);
    const second=await invalidateHistoricalResults(runDirectory,{dryRun:true});
    assert.equal(second.invalidatedCount,0);
  } finally { await rm(root,{recursive:true,force:true}); }
});
