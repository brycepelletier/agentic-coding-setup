#!/usr/bin/env node
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { basename, dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { writeJsonAtomically } from './atomic-write.mjs';
import { loadPersistedReviews, loadScoringConfig, renderWeightedReport, scoreRun } from './weighted-scoring.mjs';
import { showHelp, validateArguments, wantsHelp } from './cli-arguments.mjs';

const REASON='Historical Level 5-8 request lacked valid controlled workspace and tool-call evidence';
const HELP=`
Usage: test.mjs audit-results [RESULTS_DIRECTORY|RUN_DIRECTORY|RUN.json] [options]

Mark historical Level 5-8 text-only results as invalid_environment without
deleting or changing saved model responses or raw backend evidence.

Options:
  --scoring FILE   Scoring configuration used to refresh weighted results.
  --dry-run        Report affected evidence without changing files.
  -h, --help       Show this help.
`;

export async function invalidateHistoricalResults(input,{ dryRun=false,scoringFile }={}) {
  const runFiles=await discoverRunFiles(resolve(input));
  const summary={ schemaVersion:'1.0.0',generatedAt:new Date().toISOString(),reason:REASON,dryRun,runs:[],invalidatedCount:0 };
  for (const runFile of runFiles) {
    const runDirectory=dirname(runFile);
    const run=JSON.parse(await readFile(runFile,'utf8'));
    const entries=[];
    for (const model of run.models ?? []) for (const result of model.qualificationResults ?? []) {
      if (!requiresAgentExecution(result) || result.executionEvidence?.valid===true) continue;
      const resultFile=result.evidence?.directory && result.evidence?.resultFile
        ? resolve(runDirectory,result.evidence.directory,result.evidence.resultFile) : null;
      let artifact=null;
      if (resultFile) try { artifact=JSON.parse(await readFile(resultFile,'utf8')); } catch (error) { if (error.code!=='ENOENT') throw error; }
      const beforeResponse=artifact ? exactResponseFields(artifact) : null;
      if (artifact && artifact.result!=='invalid_environment') {
        artifact.supersededEvaluation ??= evaluationSnapshot(artifact);
        applyInvalidEnvironment(artifact);
        if (!dryRun) {
          await writeJsonAtomically(resultFile,artifact);
          const persisted=JSON.parse(await readFile(resultFile,'utf8'));
          if (JSON.stringify(exactResponseFields(persisted))!==JSON.stringify(beforeResponse)) throw new Error(`Response preservation check failed for ${resultFile}`);
        }
      }
      if (result.result!=='invalid_environment') result.supersededEvaluation ??= evaluationSnapshot(result);
      applyInvalidEnvironment(result);
      entries.push({ model:model.model ?? null,test:result.test,level:String(result.level),resultFile:resultFile ? relativeResultPath(runDirectory,resultFile) : null,rawEvidencePreserved:result.evidence?.rawBackendResponse ?? null });
    }
    if (!entries.length) continue;
    run.schemaVersion='1.2.0';
    run.environmentValidity={ outcome:'incomplete_environment',invalidatedCount:entries.length,auditFile:'environment-validity.json',reason:REASON };
    for (const model of run.models ?? []) {
      const invalid=(model.qualificationResults ?? []).filter(result=>result.result==='invalid_environment').length;
      model.failed=(model.qualificationResults ?? []).some(result=>result.result==='fail');
      if (invalid && !model.failed) model.status='incomplete_environment';
    }
    const anyFailed=run.models?.some(model=>model.failed);
    run.status=anyFailed?'completed_with_failures':'completed_incomplete_environment';
    if (run.weighted || run.options?.weighted) {
      const config=await loadScoringConfig(scoringFile);
      const reviews=await loadPersistedReviews(runDirectory,run);
      run.weighted=scoreRun(run,config,reviews);
      run.weighted.scoringConfiguration=scoringFile ?? 'config/scoring.json';
    }
    const audit={ schemaVersion:'1.0.0',runId:run.runId ?? basename(runDirectory),auditedAt:new Date().toISOString(),outcome:'incomplete_environment',reason:REASON,invalidatedCount:entries.length,entries };
    if (!dryRun) {
      await writeJsonAtomically(runFile,run);
      await writeJsonAtomically(resolve(runDirectory,'environment-validity.json'),audit);
      if (run.weighted) {
        await writeJsonAtomically(resolve(runDirectory,'weighted-results.json'),run.weighted);
        await writeFile(resolve(runDirectory,'weighted-summary.md'),renderWeightedReport(run.weighted));
      }
    }
    summary.runs.push({ runId:audit.runId,runFile,invalidatedCount:entries.length,entries });
    summary.invalidatedCount+=entries.length;
  }
  return summary;
}

function requiresAgentExecution(result) {
  const level=Number.parseInt(String(result.level ?? result.test?.match(/level-(\d+)/i)?.[1] ?? ''),10);
  return Number.isFinite(level) && level>=5 && level<=8 && !['skipped','invalid_environment'].includes(result.result);
}
function evaluationSnapshot(value) {
  return { result:value.result ?? null,notes:value.notes ?? null,rubricReviewRequired:Boolean(value.rubricReviewRequired),hardFailureCount:value.hardFailureCount ?? null,discrepancies:value.discrepancies ?? [] };
}
function applyInvalidEnvironment(value) {
  value.result='invalid_environment';
  value.notes=REASON;
  value.rubricReviewRequired=false;
  value.hardFailureCount=0;
  value.discrepancies=[];
  value.infrastructure={ valid:false,outcome:'invalid_environment',historical:true,reasons:[REASON] };
}
function exactResponseFields(value) {
  return { response:value.response,visibleResponse:value.visibleResponse,reasoningResponse:value.reasoningResponse,inferenceResponse:value.inference?.response };
}
function relativeResultPath(root,file) { return file.slice(root.length+1).replaceAll('\\','/'); }
async function discoverRunFiles(input) {
  const details=await stat(input);
  if (details.isFile()) return [input];
  try { await stat(resolve(input,'run.json')); return [resolve(input,'run.json')]; } catch {}
  const files=[];
  for (const entry of await readdir(input,{withFileTypes:true})) if (entry.isDirectory()) {
    const candidate=resolve(input,entry.name,'run.json');
    try { await stat(candidate); files.push(candidate); } catch {}
  }
  return files.sort();
}

if (process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  const args=process.argv.slice(2);
  if (wantsHelp(args)) showHelp(HELP);
  try { validateArguments(args,{ valueOptions:['--scoring'],flags:['--dry-run'],maxPositionals:1 }); }
  catch (error) { showHelp(HELP,error.message); }
  const input=args.find(value=>!value.startsWith('-')) ?? fileURLToPath(new URL('../results/',import.meta.url));
  const get=name=>{const index=args.findIndex(value=>value===name||value.startsWith(`${name}=`));return index<0?undefined:(args[index].includes('=')?args[index].slice(name.length+1):args[index+1]);};
  const result=await invalidateHistoricalResults(input,{ dryRun:args.includes('--dry-run'),scoringFile:get('--scoring') });
  if (!result.dryRun) for (const run of result.runs) await refreshQualificationSummary(run.runFile);
  console.log(`${result.dryRun?'Would mark':'Marked'} ${result.invalidatedCount} Level 5-8 result(s) across ${result.runs.length} run(s) as invalid_environment.`);
  for (const run of result.runs) console.log(`  ${run.runId}: ${run.invalidatedCount}`);
}

function refreshQualificationSummary(runFile) {
  const script=fileURLToPath(new URL('./finalize-run.mjs',import.meta.url));
  const output=resolve(dirname(runFile),'qualification-summary.md');
  return new Promise((resolveRun,reject)=>{
    const child=spawn(process.execPath,[script,runFile,'--output',output,'--weighted'],{stdio:['ignore','ignore','pipe'],windowsHide:true});
    let stderr='';
    child.stderr.setEncoding('utf8').on('data',chunk=>stderr+=chunk);
    child.on('error',reject);
    child.on('exit',code=>code===0?resolveRun():reject(new Error(`Could not refresh ${output}: ${stderr.trim()}`)));
  });
}
