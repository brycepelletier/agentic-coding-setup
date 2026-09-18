import {writeFile} from 'node:fs/promises';
import {createTarget} from './inference-target.mjs';
import {runOrchestrationScenario,scenarios} from './orchestration-runtime.mjs';
const args=process.argv.slice(2),value=name=>args[args.indexOf(name)+1];
if(args.includes('--help')||!args.includes('--model')) {
 console.log('Usage: test.mjs runtime --model MODEL --url http://localhost:8080/v1 [--scenario NAME] [--output FILE]\nRuns real SE and specialist model turns against isolated stateful service doubles. Does not qualify live GitHub/Docker integration.');
 process.exit(args.includes('--help')?0:2);
}
const target=createTarget({model:value('--model'),baseUrl:args.includes('--url')?value('--url'):'http://localhost:8080/v1',protocol:'openai-chat'});
const results=[];
for(const scenario of args.includes('--scenario')?[value('--scenario')]:scenarios) {
 try {results.push(await runOrchestrationScenario({scenario,target,onProgress:({role,turn,tool})=>console.error(`${scenario}: ${role}, ${tool||`turn ${turn+1}`}`)}));}
 catch(error) {results.push({scenario,passed:false,error:error.message});}
}
const report={qualificationKind:'mock-backed-runtime',model:target.model,liveRuntimeQualified:false,passed:results.length===scenarios.length&&results.every(r=>r.passed),results};
await writeFile(args.includes('--output')?value('--output'):'runtime-qualification.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({model:report.model,passed:report.passed,results:results.map(({scenario,passed,error})=>({scenario,passed,error}))}));
if(results.some(r=>!r.passed))process.exitCode=1;
