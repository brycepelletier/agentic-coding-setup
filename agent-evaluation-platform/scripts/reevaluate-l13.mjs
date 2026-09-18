#!/usr/bin/env node
// Offline, additive reassessment. Never queries a model or overwrites the input run.
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve, relative, isAbsolute } from 'node:path';
import { loadExecutionContracts, validateExecutionEvidence } from './execution-environment.mjs';
import { assessImplementation } from './implementation-assessment.mjs';
import { loadScoringConfig, loadPersistedReviews, scoreRun, renderWeightedReport } from './weighted-scoring.mjs';

const exec=promisify(execFile);
const [input,output]=process.argv.slice(2);
if (!input || !output) throw new Error('Usage: node scripts/reevaluate-l13.mjs INPUT_RUN_DIRECTORY NEW_OUTPUT_DIRECTORY');
const source=resolve(input),destination=resolve(output);
const inside=(root,path)=>{const rel=relative(root,path);return rel!=='' && !rel.startsWith('..') && !isAbsolute(rel);};
if (source===destination || inside(source,destination)) throw new Error('Output must be a separate, new directory outside the historical run');
const sha=value=>createHash('sha256').update(value).digest('hex');
const original=await readFile(resolve(source,'run.json'));
const report=JSON.parse(original);
const config=await loadExecutionContracts();
await mkdir(destination); // Fail if output already exists.
const provenance={sourceRun:source,sourceRunSha256:sha(original),evaluatedAt:new Date().toISOString(),modelQueried:false,results:[]};
for (const model of report.models ?? []) {
  const row=model.qualificationResults.find(item=>item.test==='L13');
  if (!row?.evidence?.directory) continue;
  const modelSource=resolve(source,row.evidence.directory);
  const modelOutput=resolve(destination,row.evidence.directory);
  if (!inside(source,modelSource) || !inside(destination,modelOutput)) throw new Error('Invalid evidence directory');
  await cp(modelSource,modelOutput,{recursive:true,errorOnExist:true});
  const resultPath=resolve(modelSource,row.evidence.resultFile);
  if (!inside(modelSource,resultPath)) throw new Error('Invalid result path');
  const bytes=await readFile(resultPath);
  const result=JSON.parse(bytes);
  const evidence=result.executionEvidence;
  let updated;
  const detail={model:model.model,sourceResult:resultPath,sourceResultSha256:sha(bytes),originalResult:result.result};
  try {
    if (!evidence?.workspace || !evidence.task) throw new Error('Preserved execution workspace metadata unavailable');
    const originalTask=resolve(evidence.workspace,evidence.task.workspacePath);
    if (!inside(source,originalTask)) throw new Error('Preserved workspace is outside the source run');
    const captured=evidence.postExecution?.task;
    const commit=evidence.task.baseline?.commit ?? captured?.baselineCommit;
    if (!/^[a-f0-9]{40}$/.test(commit ?? '')) throw new Error('Preserved baseline commit unavailable');
    const git=async args=>(await exec('git',args,{cwd:originalTask,encoding:'buffer',windowsHide:true})).stdout;
    const files={};
    for (const name of (await git(['ls-tree','-r','--name-only',commit])).toString().trim().split('\n').filter(Boolean)) files[name]=sha(await git(['show',`${commit}:${name}`]));
    const sourceFile=resolve(originalTask,'src/normalize-metrics.mjs');
    const code=await readFile(sourceFile);
    const lastWrite=(evidence.toolCalls ?? []).filter(item=>item.name==='write_file' && item.result?.ok && item.arguments?.path==='task/telemetry-normalizer/src/normalize-metrics.mjs').at(-1);
    if (!lastWrite || sha(Buffer.from(lastWrite.arguments.content))!==sha(code)) throw new Error('Preserved source does not match the final successful recorded write');
    detail.implementationSha256=sha(code);
    detail.baselineCommit=commit;
    const workspace=resolve(destination,'.workspaces',row.evidence.directory);
    const taskPath=resolve(workspace,evidence.task.workspacePath);
    await mkdir(workspace,{recursive:true});
    await cp(originalTask,taskPath,{recursive:true});
    const definition=config.taskFixtures[evidence.task.name];
    if (!definition) throw new Error('Unknown preserved task fixture');
    const environment={valid:true,workspace,manifest:{fixtures:[]},task:{...definition,...evidence.task,path:taskPath,baseline:{files,commit}}};
    const validation=await validateExecutionEvidence({testId:'L13',environment,response:result.visibleResponse ?? result.response,toolEvidence:evidence.toolCalls});
    updated=assessImplementation({...result,discrepancies:[...(result.discrepancies ?? []),...validation.discrepancies],executionEvidence:{...evidence,...validation,valid:validation.postExecution.valid,workspace}});
    detail.acceptance=validation.acceptance;
  } catch(error) {
    updated={...result,result:'execution_incomplete',rubricReviewRequired:false,infrastructure:{valid:false,outcome:'execution_incomplete',reasons:[`Offline L13 reassessment unavailable: ${error.message}`]}};
    detail.error=error.message;
  }
  detail.result=updated.result;
  updated.level='L13';
  updated.reassessment={...detail,evaluatedAt:provenance.evaluatedAt,modelQueried:false};
  await writeFile(resolve(modelOutput,row.evidence.resultFile),JSON.stringify(updated,null,2));
  // Keep copied compatibility aliases consistent with the corrected canonical result.
  await writeFile(resolve(modelOutput,'level-8-controlled-implementation.json'),JSON.stringify(updated,null,2));
  Object.assign(row,{result:updated.result,notes:updated.result==='fail'?'L13 deterministic acceptance reassessment failed':updated.result,discrepancies:updated.discrepancies,rubricReviewRequired:updated.rubricReviewRequired,infrastructure:updated.infrastructure,executionEvidence:updated.executionEvidence,implementationComponents:updated.implementationComponents});
  provenance.results.push(detail);
  if (sha(await readFile(resultPath))!==detail.sourceResultSha256) throw new Error('Historical result changed during reassessment');
}
report.reassessment=provenance;
const scoring=await loadScoringConfig();
report.weighted=scoreRun(report,scoring,await loadPersistedReviews(source,report));
await writeFile(resolve(destination,'run.json'),JSON.stringify(report,null,2));
await writeFile(resolve(destination,'weighted-results.json'),JSON.stringify(report.weighted,null,2));
await writeFile(resolve(destination,'weighted-summary.md'),renderWeightedReport(report.weighted));
await writeFile(resolve(destination,'reassessment.json'),JSON.stringify(provenance,null,2));
if (sha(await readFile(resolve(source,'run.json')))!==provenance.sourceRunSha256) throw new Error('Historical run changed during reassessment');
console.log(JSON.stringify(provenance,null,2));
