import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fixtureBackend,runOrchestrationScenario} from './orchestration-runtime.mjs';

test('SE -> GitHub Operator -> real disposable Git push -> verified ref -> SE continues',async()=>{
 const temporary=await mkdtemp(path.join(tmpdir(),'operator-runtime-'));
 const work=path.join(temporary,'work'),remote=path.join(temporary,'remote.git');
 const git=(args,cwd=temporary)=>execFileSync('git',['-c','core.hooksPath=/dev/null',...args],{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe'],env:{...process.env,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:process.platform==='win32'?'NUL':'/dev/null',GIT_TERMINAL_PROMPT:'0'}}).trim();
 try {
  git(['init','--bare',remote]);git(['init',work]);git(['symbolic-ref','HEAD','refs/heads/qualification'],work);
  await writeFile(path.join(work,'fixture.txt'),'Runtime qualification only\n');
  git(['add','fixture.txt'],work);git(['-c','user.name=Qualification','-c','user.email=qualification@example.invalid','commit','-m','Disposable qualification commit'],work);
  git(['remote','add','origin',remote],work);
  const backend=fixtureBackend();backend.state.local=git(['rev-parse','HEAD'],work);backend.state.remote='';
  const mockCall=backend.call;
  backend.call=async(role,name,args)=>{
   if(role==='GitHub Operator'&&name==='git_remote'&&['push_dry_run','push','ls_remote'].includes(args.operation)) {
    if(args.operation==='ls_remote') {const stdout=git(['ls-remote','origin','refs/heads/qualification'],work);return {exit_code:0,stdout,oid:stdout.split(/\s/)[0]};}
    const dry=args.operation==='push_dry_run';
    git(['push',...(dry?['--dry-run']:[]),'origin','qualification'],work);
    const observed=git(['ls-remote','origin','refs/heads/qualification'],work);
    if(dry)assert.equal(observed,'','Preflight must not mutate the bare remote');
    else {backend.state.remote=observed.split(/\s/)[0];backend.state.pushes++;}
    return {exit_code:0,dry_run:dry};
   }
   return mockCall(role,name,args);
  };
  const query=async({role,input})=>{
   const count=input.messages.filter(m=>m.role==='tool').length;
   const call=(name,args)=>({toolCalls:[{id:`${role}-${count}`,type:'function',function:{name,arguments:JSON.stringify(args)}}]});
   if(role==='Software Engineer')return count?{visibleResponse:`Push verified ${backend.state.local}`}:call('runSubagent',{agentName:'GitHub Operator',prompt:'Push and verify disposable fixture'});
   const ops=['push_dry_run','push','ls_remote'];
   return count<ops.length?call('git_remote',{operation:ops[count],branch:'qualification',remote:'origin'}):{visibleResponse:`agent_name: GitHub Operator\nPush and remote verified ${backend.state.local}`};
  };
  const result=await runOrchestrationScenario({scenario:'push',backend,query});
  assert.equal(result.passed,true);assert.equal(backend.state.local,backend.state.remote);
 }finally{
  assert.equal(path.dirname(temporary),tmpdir());
  await rm(temporary,{recursive:true,force:true});
 }
});
