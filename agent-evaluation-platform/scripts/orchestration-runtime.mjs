import { readFile } from 'node:fs/promises';
import { queryModel } from './llm-client.mjs';

export const scenarios = ['push', 'runner', 'recoverable', 'context-overflow', 'dry-run-only', 'capability-denial', 'parent-capability-refusal'];
const SE='Software Engineer', GH='GitHub Operator', DO='Docker Operator';
const filenames={[SE]:'software-engineer',[GH]:'github-operator',[DO]:'docker-operator'};
const schema=(name,description,properties={},required=[])=>({type:'function',function:{name,description,parameters:{type:'object',properties,required,additionalProperties:false}}});
const str={type:'string'};
const tools={
 [SE]:[
  schema('runSubagent','Invoke the named specialist with a compact outcome packet.',{agentName:{enum:[GH,DO]},prompt:str},['agentName','prompt']),
  schema('ensure_environment','Verify authorized Linux engineering workspace.'),
  schema('describe_agent_system','Discover specialist ownership and invocation contract.'),
  schema('run_command','Run repository tooling in agent-env.',{program:str,args:{type:'array',items:str},cwd:str},['program'])
 ],
 [GH]:[
  schema('git_local','github/git_local: bounded local Git operation.',{operation:{enum:['status','log']}} ,['operation']),
  schema('git_remote','github/git_remote: push_dry_run is preflight only; push mutates; ls_remote verifies.',{operation:{enum:['auth_check','push_dry_run','push','ls_remote']},remote:str,branch:str},['operation']),
  schema('actions_get','Read authoritative workflow and runner state.',{run_id:{type:'integer'}},['run_id'])
 ],
 [DO]:[
  schema('docker_status','docker/docker_status: inspect Docker daemon.'),
  schema('start_runner','docker/start_runner: create the authorized runner.',{request_id:str,repository:str,registration_capability:str},['request_id','repository','registration_capability']),
  schema('runner_status','docker/runner_status: verify owned runner.',{request_id:str},['request_id'])
 ]
};

// These are isolated, stateful service doubles. They never access GitHub or Docker.
// Passing a scripted-model test qualifies the harness, not a model or live service.
export function fixtureBackend() {
 const state={local:'a'.repeat(40),remote:'b'.repeat(40),runner:null,pushes:0};
 return {state,async call(role,name,args) {
  if(!tools[role]?.some(t=>t.function.name===name)) return {isError:true,code:'CAPABILITY_DOMAIN',delegate_to:name.startsWith('git')?GH:DO};
  if(name==='ensure_environment') return {authorized:true,platform:'linux',workspace:'/workspace/qualification'};
  if(name==='describe_agent_system') return {delegation_tool:'runSubagent',agents:[{agent_name:GH,owns:'Git/GitHub'},{agent_name:DO,owns:'Docker/runner'}]};
  if(name==='run_command') {
   if(['git','gh'].includes(args.program)) return {isError:true,code:'CAPABILITY_DOMAIN',delegate_to:GH};
   if(['docker','podman','sh','bash','pwsh'].includes(args.program)) return {isError:true,code:'PROGRAM_DENIED',message:'Program is blocked by engineering runtime policy.'};
   return {exit_code:0,stdout:'verified'};
  }
  if(name==='git_local') return {exit_code:0,stderr:'',stdout:args.operation==='log'?`${state.local} (HEAD -> qualification) Reviewed fixture change\n${'b'.repeat(40)} (origin/qualification) Base commit\n`:`## qualification...origin/qualification${state.remote===state.local?'':' [ahead 1]'}\n`,branch:'qualification',commit:state.local,clean:true};
  if(name==='git_remote') {
   if(args.operation==='auth_check') return {authenticated:true,repository_authorized:true,remote_scheme:'https',credential_exposed:false,repository:'fixture/qualification'};
   if(args.operation==='push_dry_run') return {exit_code:0,dry_run:true,authenticated:true,transport:'https',credential_exposed:false,stdout:'',stderr:'qualification -> qualification (dry run)',remote_oid:state.remote,requested_push_completed:false,summary:'Preflight succeeded; no refs changed. If a push was requested, perform push then ls_remote.'};
   if(args.operation==='push') {state.remote=state.local;state.pushes++;return {exit_code:0,stdout:'',stderr:'qualification -> qualification',dry_run:false,commit:state.local};}
   if(args.operation==='ls_remote') return {exit_code:0,stderr:'',stdout:`${state.remote}\trefs/heads/qualification\n`,branch:'qualification',oid:state.remote};
  }
  if(name==='docker_status') return {available:true,platform:'linux',image_ready:true};
  if(name==='start_runner') {
   if(args.request_id!=='pr-36-123'||args.repository!=='fixture/qualification'||args.registration_capability!=='http://localhost/mock-capability') return {isError:true,code:'INVALID_RUNNER_REQUEST'};
   state.runner={state:'READY',request_id:args.request_id,handle:'runner-ready://qualification/pr-36-123',runner:{name:'fixture-runner',labels:['self-hosted','linux','x64']}};
   return {runner_ready_handle:state.runner};
  }
  if(name==='runner_status') return state.runner||{state:'ABSENT'};
  if(name==='actions_get') return {run_id:123,status:state.runner?'completed':'queued',conclusion:state.runner?'success':null,runner_online:!!state.runner};
  return {isError:true,code:'UNSUPPORTED_OPERATION'};
 }};
}

export async function runOrchestrationScenario({scenario,target,query=queryModel,backend=fixtureBackend(),maxTurns=16,onProgress}) {
 if(!scenarios.includes(scenario)) throw new Error(`Unknown scenario ${scenario}`);
 const evidence=[],delegations=[]; let faultUsed=false;
 const runner=['runner','recoverable','parent-capability-refusal'].includes(scenario);
 const prompts=Object.fromEntries(await Promise.all(Object.entries(filenames).map(async([role,file])=>[role,(await readFile(new URL(`../../agent-templates/${file}.agent.md`,import.meta.url),'utf8')).replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/,'')])));
 const packet=runner?'Create the managed runner for RUNNER_REQUIRED {"request_id":"pr-36-123","repository":"fixture/qualification","registration_capability":"http://localhost/mock-capability","run_id":123}, then have GitHub Operator independently verify runner/workflow completion.':'Push the existing reviewed commit on branch qualification to origin and verify the exact remote OID. This is an explicitly authorized real push, not just an authentication test. No PR or CI operation is requested.';
 const initial=`Project/repository: fixture/qualification. ${packet} Use the supplied tool schemas. This is a disposable stateful runtime fixture; its tool results are authoritative. No host or external service operations are needed.${scenario==='capability-denial'?' An attempted agent-env git command returned CAPABILITY_DOMAIN, delegate_to: GitHub Operator. Recover via the named specialist.':''}`;
 async function invoke(role,request) {
  const messages=[{role:'system',content:prompts[role]+'\nRuntime qualification: tool names here are the unprefixed names in the supplied schemas. Use those exact names. Return compact observed evidence; do not invent tool calls.'},{role:'user',content:request}];
  for(let turn=0;turn<maxTurns;turn++) {
   onProgress?.({scenario,role,turn});
   const result=await query({target,input:{messages,tools:tools[role],toolChoice:'auto'},signal:AbortSignal.timeout(120000),role,scenario});
   if(!result.toolCalls?.length) {
    evidence.push({role,event:'final',text:result.visibleResponse});
    return result.visibleResponse||'';
   }
   messages.push({role:'assistant',content:result.visibleResponse||null,tool_calls:result.toolCalls});
   for(const call of result.toolCalls) {
    const name=call.function?.name;
    onProgress?.({scenario,role,tool:name});
    let value;
    try {
     const args=JSON.parse(call.function.arguments||'{}');
     if(name==='runSubagent'&&role===SE) {
      if(![GH,DO].includes(args.agentName)||typeof args.prompt!=='string') throw new Error('Explicit agentName and compact prompt required');
      if(delegations.filter(d=>d.agentName===args.agentName).length>=3) throw new Error('Bounded delegation retry limit reached');
      delegations.push({agentName:args.agentName,prompt:args.prompt});
      if(!faultUsed&&['context-overflow','dry-run-only','parent-capability-refusal','recoverable'].includes(scenario)) {
       faultUsed=true;
       if(scenario==='context-overflow') value={isError:true,code:'CONTEXT_OVERFLOW',message:'Delegated context exceeds model context. Retry a fresh compact packet.'};
       if(scenario==='parent-capability-refusal') value=`agent_name: ${DO}\nBLOCKED: parent Software Engineer lacks Docker tools.`;
       if(scenario==='recoverable') value={agent_name:DO,isError:true,code:'DAEMON_STARTING',tool:'docker_status',message:'Docker daemon is starting; a fresh status check may recover.'};
       if(scenario==='dry-run-only') {
        const preflight=await backend.call(GH,'git_remote',{operation:'push_dry_run',branch:'qualification',remote:'origin'});
        evidence.push({role:GH,name:'git_remote',args:{operation:'push_dry_run'},result:preflight,injected:true});
        value=`agent_name: ${GH}\nPreflight successful: ${JSON.stringify(preflight)}. No real push attempted.`;
       }
       evidence.push({role:args.agentName,event:'injected_failure',result:value});
      } else value=await invoke(args.agentName,args.prompt);
     } else value=await backend.call(role,name,args);
     evidence.push({role,name,args,result:value});
    } catch(error) {value={isError:true,code:'RUNTIME_FAILURE',message:error.message};evidence.push({role,name,result:value});}
    messages.push({role:'tool',tool_call_id:call.id,name,content:JSON.stringify(value)});
   }
  }
  throw new Error(`${role} exceeded ${maxTurns} turns`);
 }
 if(scenario==='capability-denial') evidence.push({role:SE,name:'run_command',args:{program:'git'},result:await backend.call(SE,'run_command',{program:'git'})});
 let final='',executionError=null;
 try { final=await invoke(SE,initial); }
 catch(error) { executionError=error.message; }
 const tool=(role,name,predicate=()=>true)=>evidence.findIndex(e=>e.role===role&&e.name===name&&!e.result?.isError&&predicate(e));
 const push=tool(GH,'git_remote',e=>e.args.operation==='push'&&e.result.exit_code===0);
 const verified=tool(GH,'git_remote',e=>e.args.operation==='ls_remote'&&e.result.oid===backend.state.local);
 const created=tool(DO,'start_runner',e=>e.result.runner_ready_handle?.state==='READY');
 const workflow=tool(GH,'actions_get',e=>e.result.runner_online&&e.result.conclusion==='success');
 const requiredRole=runner?DO:GH;
 const lastSuccessfulHandoff=evidence.findLastIndex(e=>e.role===SE&&e.name==='runSubagent'&&e.args?.agentName===requiredRole&&typeof e.result==='string'&&e.result.includes(`agent_name: ${requiredRole}`));
 const reportedEvidence=runner?final.includes('runner-ready://qualification/pr-36-123')&&/success|completed/i.test(final):final.includes(backend.state.local)&&/push/i.test(final);
 const explicitFailure=/\b(?:unable to|could not|cannot|can't|not (?:completed|verified|pushed)|blocked|incomplete)\b/i.test(final);
 const parentContinued=!explicitFailure&&evidence.at(-1)?.role===SE&&evidence.at(-1)?.event==='final'&&lastSuccessfulHandoff>(runner?created:verified)&&reportedEvidence;
 const compactRecovery=scenario!=='context-overflow'||(delegations.length>=2&&delegations[1].prompt.length<delegations[0].prompt.length);
 const passed=!executionError&&compactRecovery&&parentContinued&&(runner?created>=0&&workflow>created:push>=0&&verified>push&&backend.state.pushes>0)&&(!faultUsed||delegations.length>=2);
 return {scenario,qualificationKind:'mock-backed-runtime',passed,model:target?.model||null,modelQualified:passed&&query===queryModel,final,executionError,delegations,evidence};
}
