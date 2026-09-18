import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { executeAgentQualification, ExecutionIncompleteError } from './agent-execution.mjs';
import { createTarget } from './inference-target.mjs';

test('missing finish evidence is execution_incomplete rather than output-format failure',async()=>{
  const server=createServer(async(request,response)=>{
    for await (const _ of request) {}
    response.writeHead(200,{'content-type':'text/event-stream'});
    response.end('data: {"choices":[{"delta":{}}]}\n\ndata: [DONE]\n');
  });
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  try {
    const address=server.address();
    const target=createTarget({model:'incomplete',protocol:'openai-chat',baseUrl:`http://127.0.0.1:${address.port}/v1`});
    const environment={toolNames:[],workspace:'controlled',manifest:{executionVersion:'test',fixtures:[]},referenceArtifacts:[],task:null,priorEvidence:null,evidenceSource:null};
    await assert.rejects(()=>executeAgentQualification({target,messages:[{role:'user',content:'answer'}],environment}),error=>{
      assert.ok(error instanceof ExecutionIncompleteError);
      assert.equal(error.evidence.reason,'missing_finish_reason');
      assert.equal(error.evidence.turns.length,1);
      return true;
    });
  } finally { server.close(); await once(server,'close'); }
});

test('turn-limit termination preserves partial tool evidence',async()=>{
  const server=createServer(async(request,response)=>{
    for await (const _ of request) {}
    response.writeHead(200,{'content-type':'text/event-stream'});
    response.end([
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"list_directory","arguments":"{\\"path\\":\\".\\"}"}}]},"finish_reason":"tool_calls"}]}',
      '', 'data: [DONE]', ''
    ].join('\n'));
  });
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  try {
    const address=server.address();
    const target=createTarget({model:'turn-limit',protocol:'openai-chat',baseUrl:`http://127.0.0.1:${address.port}/v1`});
    const environment={toolNames:['list_directory'],workspace:process.cwd(),manifest:{executionVersion:'test',fixtures:[]},referenceArtifacts:[],task:null,priorEvidence:null,evidenceSource:null};
    await assert.rejects(()=>executeAgentQualification({target,messages:[{role:'user',content:'inspect'}],environment,maxTurns:1}),error=>{
      assert.ok(error instanceof ExecutionIncompleteError);
      assert.equal(error.evidence.reason,'turn_limit');
      assert.equal(error.evidence.toolEvidence.length,1);
      return true;
    });
  } finally { server.close(); await once(server,'close'); }
});
