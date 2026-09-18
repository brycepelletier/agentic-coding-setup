import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir,mkdtemp,readFile,rm,writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { auditExecutionOutcomes } from './audit-execution-outcomes.mjs';

test('reclassifies incomplete and prerequisite-blocked evidence without changing responses',async()=>{
  const root=await mkdtemp(join(tmpdir(),'agent-execution-audit-'));
  try {
    const modelDir=join(root,'model');await mkdir(modelDir);
    const response='';
    const level5={result:'fail',response,visibleResponse:response,reasoningResponse:'preserved',hardFailureCount:9,discrepancies:[{classification:'OUTPUT FORMAT FAILURE'}],inference:{response:{visible:''},agentExecution:{turns:[{finishReason:null,visibleResponse:''}]}}};
    const level6={result:'invalid_environment',response:'preserved level 6',visibleResponse:'preserved level 6',discrepancies:[],infrastructure:{reasons:['prior evidence level-5-repository-discovery.md is not valid agent-execution evidence']}};
    await writeFile(join(modelDir,'level5.json'),JSON.stringify(level5));await writeFile(join(modelDir,'level6.json'),JSON.stringify(level6));
    const run={runId:'audit',models:[{model:'candidate',qualificationResults:[
      {test:'level-5-repository-discovery.md',level:'5',result:'fail',discrepancies:[{}],evidence:{directory:'model',resultFile:'level5.json'}},
      {test:'level-6-architecture-reconstruction.md',level:'6',result:'invalid_environment',infrastructure:level6.infrastructure,evidence:{directory:'model',resultFile:'level6.json'}}
    ]}]};
    await writeFile(join(root,'run.json'),JSON.stringify(run));
    const audit=await auditExecutionOutcomes(root);
    assert.equal(audit.changes.length,2);
    const migrated5=JSON.parse(await readFile(join(modelDir,'level5.json'),'utf8'));
    const migrated6=JSON.parse(await readFile(join(modelDir,'level6.json'),'utf8'));
    assert.equal(migrated5.result,'execution_incomplete');assert.equal(migrated5.reasoningResponse,'preserved');assert.equal(migrated5.supersededEvaluation.result,'fail');
    assert.equal(migrated6.result,'blocked_by_prerequisite');assert.equal(migrated6.visibleResponse,'preserved level 6');
    assert.equal((await auditExecutionOutcomes(root,{dryRun:true})).changes.length,0);
  } finally {await rm(root,{recursive:true,force:true});}
});
