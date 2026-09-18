import test from 'node:test';
import assert from 'node:assert/strict';
import {scenarios,runOrchestrationScenario} from './orchestration-runtime.mjs';

const response=(name,args={})=>({toolCalls:[{id:Math.random().toString(),type:'function',function:{name,arguments:JSON.stringify(args)}}]});
function scriptedModel({role,input,scenario}) {
 const results=input.messages.filter(m=>m.role==='tool');
 const runner=['runner','recoverable','parent-capability-refusal'].includes(scenario);
 if(role==='Software Engineer') {
  const childResults=results.filter(m=>m.name==='runSubagent');
  if(!childResults.length||/CONTEXT_OVERFLOW|No real push|parent Software Engineer|DAEMON_STARTING/.test(childResults.at(-1).content)) return response('runSubagent',{agentName:runner?'Docker Operator':'GitHub Operator',prompt:'fixture/qualification: '+(runner?'create pr-36-123 runner using supplied capability':'push qualification to origin, then verify OID')+(scenario==='context-overflow'&&!childResults.length?' Relevant observations: clean reviewed branch; user explicitly authorized the real push.':'')});
  if(runner&&childResults.length===(scenario==='runner'?1:2)) return response('runSubagent',{agentName:'GitHub Operator',prompt:'Verify run 123 with runner_ready_handle from Docker Operator.'});
  return {visibleResponse:runner?'Completed workflow success, runner-ready://qualification/pr-36-123':'Push completed and verified: '+ 'a'.repeat(40)};
 }
 if(role==='Docker Operator') {
  if(!results.length) return response('docker_status');
  if(results.length===1) return response('start_runner',{request_id:'pr-36-123',repository:'fixture/qualification',registration_capability:'http://localhost/mock-capability'});
  return {visibleResponse:'agent_name: Docker Operator\nrunner_ready_handle: '+results.at(-1).content};
 }
 if(runner) return results.length?{visibleResponse:'agent_name: GitHub Operator\nWorkflow completed.'}:response('actions_get',{run_id:123});
 const ops=['auth_check','push_dry_run','push','ls_remote'];
 return results.length<ops.length?response('git_remote',{operation:ops[results.length],remote:'origin',branch:'qualification'}):{visibleResponse:'agent_name: GitHub Operator\nActual push verified.'};
}
for(const scenario of scenarios) test(`runtime chain: ${scenario}`,async()=>{
 const result=await runOrchestrationScenario({scenario,query:scriptedModel});
 assert.equal(result.passed,true);
 assert.equal(result.modelQualified,false,'Scripted models must never qualify a real model');
 assert.equal(result.evidence.at(-1).role,'Software Engineer');
 if(scenario==='context-overflow') {
  assert.ok(result.delegations[1].prompt.length<result.delegations[0].prompt.length);
  assert.match(result.delegations[1].prompt,/fixture\/qualification.*push.*verify OID/);
 }
});
test('narrative-only completion cannot qualify',async()=>{
 const result=await runOrchestrationScenario({scenario:'push',query:async()=>({visibleResponse:'Everything succeeded'})});
 assert.equal(result.passed,false);
});
test('preflight-only completion cannot qualify',async()=>{
 const result=await runOrchestrationScenario({scenario:'push',query:async({role,input})=>role==='Software Engineer'?input.messages.some(m=>m.role==='tool')?{visibleResponse:'Done'}:response('runSubagent',{agentName:'GitHub Operator',prompt:'push'}):input.messages.some(m=>m.role==='tool')?{visibleResponse:'agent_name: GitHub Operator\nDone'}:response('git_remote',{operation:'push_dry_run',branch:'qualification'})});
 assert.equal(result.passed,false);
});
test('specialists cannot inherit parent or other specialist authority',async()=>{
 const {fixtureBackend}=await import('./orchestration-runtime.mjs');
 const backend=fixtureBackend();
 assert.equal((await backend.call('Software Engineer','git_remote',{operation:'push'})).code,'CAPABILITY_DOMAIN');
 assert.equal((await backend.call('GitHub Operator','start_runner',{})).code,'CAPABILITY_DOMAIN');
 assert.equal((await backend.call('Software Engineer','run_command',{program:'docker'})).code,'PROGRAM_DENIED');
 assert.equal(backend.state.pushes,0);
});
test('parent failure report after completed child tools is not qualified',async()=>{
 const result=await runOrchestrationScenario({scenario:'push',query:async args=>{
  const response=scriptedModel(args);
  return args.role==='Software Engineer'&&response.visibleResponse?{visibleResponse:'Unable to complete delegated push of '+ 'a'.repeat(40)}:response;
 }});
 assert.equal(result.passed,false);
});
