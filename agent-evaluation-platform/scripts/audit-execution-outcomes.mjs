#!/usr/bin/env node
import { readFile,stat,writeFile } from 'node:fs/promises';
import { basename,dirname,resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath,pathToFileURL } from 'node:url';
import { writeJsonAtomically } from './atomic-write.mjs';
import { loadPersistedReviews,loadScoringConfig,renderWeightedReport,scoreRun } from './weighted-scoring.mjs';
import { showHelp,validateArguments,wantsHelp } from './cli-arguments.mjs';

const HELP=`
Usage: test.mjs audit-execution RUN_DIRECTORY|RUN.json [--dry-run]

Reclassify preserved agent-execution evidence using the current termination and
prerequisite outcome semantics. No model request is made and response evidence
is never rewritten.

Options:
  --dry-run   Report changes without writing them.
  -h, --help  Show this help.
`;

export async function auditExecutionOutcomes(input,{dryRun=false}={}) {
  const runFile=resolve(input).toLowerCase().endsWith('.json')?resolve(input):resolve(input,'run.json');
  await stat(runFile);
  const runDirectory=dirname(runFile);
  const run=JSON.parse(await readFile(runFile,'utf8'));
  const changes=[];
  for (const model of run.models??[]) for (const result of model.qualificationResults??[]) {
    const artifactFile=result.evidence?.directory&&result.evidence?.resultFile?resolve(runDirectory,result.evidence.directory,result.evidence.resultFile):null;
    let artifact=null;
    if (artifactFile) try { artifact=JSON.parse(await readFile(artifactFile,'utf8')); } catch {}
    const classification=classify(result,artifact);
    if (!classification) continue;
    const beforeResponse=artifact?responseSnapshot(artifact):null;
    if (artifact) {
      artifact.supersededEvaluation??=evaluationSnapshot(artifact);
      applyOutcome(artifact,classification);
      if (!dryRun) {
        await writeJsonAtomically(artifactFile,artifact);
        const persisted=JSON.parse(await readFile(artifactFile,'utf8'));
        if (JSON.stringify(responseSnapshot(persisted))!==JSON.stringify(beforeResponse)) throw new Error(`Response preservation failed for ${artifactFile}`);
      }
    }
    result.supersededEvaluation??=evaluationSnapshot(result);
    applyOutcome(result,classification);
    changes.push({model:model.model,test:result.test,from:result.supersededEvaluation.result,to:classification.outcome,resultFile:artifactFile?artifactFile.slice(runDirectory.length+1).replaceAll('\\','/'):null});
  }
  if (changes.length&&!dryRun) {
    const scoring=await loadScoringConfig();
    const reviews=await loadPersistedReviews(runDirectory,run);
    if (run.weighted||run.options?.weighted) {
      run.weighted=scoreRun(run,scoring,reviews);
      await writeJsonAtomically(resolve(runDirectory,'weighted-results.json'),run.weighted);
      await writeFile(resolve(runDirectory,'weighted-summary.md'),renderWeightedReport(run.weighted,scoring));
    }
    await writeJsonAtomically(runFile,run);
    await writeJsonAtomically(resolve(runDirectory,'execution-outcome-audit.json'),{schemaVersion:'1.0.0',runId:run.runId,auditedAt:new Date().toISOString(),changes});
  }
  return {runId:run.runId,dryRun,changes};
}

function classify(result,artifact) {
  const reasons=result.infrastructure?.reasons??artifact?.infrastructure?.reasons??[];
  if (result.result==='invalid_environment'&&reasons.length&&reasons.every(reason=>/prior evidence|prior-stage artifact/i.test(reason))) return {outcome:'blocked_by_prerequisite',reason:'required candidate-produced prior-stage artifact was unavailable or invalid'};
  const turns=artifact?.inference?.agentExecution?.turns??artifact?.executionEvidence?.turns??[];
  const last=turns.at(-1);
  const empty=!String(artifact?.visibleResponse??artifact?.response??'').trim();
  if (result.result==='fail'&&turns.length&&empty&&last?.finishReason==null) return {outcome:'execution_incomplete',reason:'agent execution ended without finish evidence or a final answer',termination:'missing_finish_reason'};
  return null;
}
function applyOutcome(value,classification) {
  value.result=classification.outcome;
  value.notes=classification.reason;
  value.rubricReviewRequired=false;
  value.hardFailureCount=0;
  value.discrepancies=[];
  value.infrastructure={valid:false,outcome:classification.outcome,reasons:[classification.reason]};
  if (classification.termination) {
    value.executionTermination={reason:classification.termination};
    if (value.executionEvidence) {value.executionEvidence.valid=false;value.executionEvidence.termination={reason:classification.termination};}
  }
}
function evaluationSnapshot(value){return{result:value.result??null,notes:value.notes??null,hardFailureCount:value.hardFailureCount??null,rubricReviewRequired:Boolean(value.rubricReviewRequired),discrepancies:value.discrepancies??[]};}
function responseSnapshot(value){return{response:value.response,visibleResponse:value.visibleResponse,reasoningResponse:value.reasoningResponse,inferenceResponse:value.inference?.response};}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const args=process.argv.slice(2);
  if(wantsHelp(args))showHelp(HELP);
  try{validateArguments(args,{flags:['--dry-run'],maxPositionals:1});}catch(error){showHelp(HELP,error.message);}
  const input=args.find(value=>!value.startsWith('-'));
  if(!input)showHelp(HELP,'Provide a run directory or run.json');
  const result=await auditExecutionOutcomes(input,{dryRun:args.includes('--dry-run')});
  console.log(`${result.dryRun?'Would reclassify':'Reclassified'} ${result.changes.length} result(s) in run ${result.runId}.`);
  for(const change of result.changes)console.log(`  ${change.model} · ${change.test}: ${change.from} -> ${change.to}`);
}
