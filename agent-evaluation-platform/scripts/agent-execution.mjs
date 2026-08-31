import { getInferenceAdapter } from './inference-adapters.mjs';
import { queryModel } from './llm-client.mjs';
import { agentToolDefinitions, executeAgentTool } from './execution-environment.mjs';

export async function executeAgentQualification({ target, messages, environment, onProgress, maxTurns = 32 }) {
  const adapter=getInferenceAdapter(target.protocol);
  if (!adapter.supportsToolCalls) throw new InvalidAgentEnvironmentError(`protocol ${target.protocol} does not expose tool-call semantics`);
  const tools=agentToolDefinitions(environment.toolNames);
  const executionMessage={
    role:'system',
    content:[
      'Controlled agent execution environment:',
      `- Workspace root: ${environment.workspace}`,
      `- Reference fixtures: ${environment.manifest.fixtures.map(fixture=>fixture.workspacePath).join(', ')}`,
      '- Use the supplied tools to inspect real files. Do not claim a path unless a tool established it.',
      '- Cite repository evidence only in canonical backticks as `fixtures/<repository>/<path>`.',
      '- Reference fixtures are read-only. Only the bounded read/search and read-only Git commands are authorized.',
      '- Before the final answer, run `git status --short` in each fixture repository and report the observed result.'
    ].join('\n')
  };
  const transcript=[messages[0],executionMessage,...messages.slice(1)].filter(Boolean);
  if (environment.priorEvidence) transcript.splice(transcript.length-1,0,{ role:'system',content:`Prior qualification evidence (${environment.priorEvidence.test ?? 'previous level'}):\n${environment.priorEvidence.visibleResponse ?? environment.priorEvidence.response ?? ''}` });
  const turns=[];
  const toolEvidence=[];
  const raw=[];
  let final=null;
  for (let turn=1;turn<=maxTurns;turn++) {
    onProgress?.({ stage:'agent_turn',turn,elapsedMs:0 });
    const result=await queryModel({ target,input:{ messages:transcript,tools,toolChoice:'auto' },onProgress });
    raw.push(`--- AGENT TURN ${turn} ---\n${result.rawBackendEvidence?.body ?? ''}`);
    turns.push({ turn,inference:result.inference,visibleResponse:result.visibleResponse,reasoningResponse:result.reasoningResponse,finishReason:result.finishReason,toolCalls:result.toolCalls,performance:result.performance });
    if (!result.toolCalls?.length) { final=result; break; }
    transcript.push({ role:'assistant',content:result.visibleResponse || null,tool_calls:result.toolCalls });
    for (const call of result.toolCalls) {
      onProgress?.({ stage:'tool_execution',turn,tool:call.function?.name });
      const item=await executeAgentTool({ name:call.function?.name,arguments:call.function?.arguments },environment);
      item.toolCallId=call.id;
      item.turn=turn;
      toolEvidence.push(item);
      transcript.push({ role:'tool',tool_call_id:call.id,name:call.function?.name,content:JSON.stringify(item.result) });
    }
  }
  if (!final) throw new Error(`Agent execution exceeded ${maxTurns} turns without a final response`);
  const performance=aggregatePerformance(turns.map(turn=>turn.performance));
  return {
    ...final,
    performance,
    rawBackendEvidence:{ contentType:'application/x-agent-execution-transcript',body:raw.join('\n\n') },
    inference:{
      ...final.inference,
      input:{ messages:transcript,tools },
      response:{ ...final.inference.response, visible:final.visibleResponse, reasoning:final.reasoningResponse },
      agentExecution:{ executionVersion:environment.manifest.executionVersion,workspace:environment.workspace,fixtures:environment.manifest.fixtures,turns,toolEvidence }
    },
    agentExecution:{ transcript,turns,toolEvidence }
  };
}

export class InvalidAgentEnvironmentError extends Error {
  constructor(message) { super(message); this.name='InvalidAgentEnvironmentError'; }
}

function aggregatePerformance(rows) {
  const sum=field=>{const values=rows.map(row=>row?.[field]).filter(value=>value!==null&&value!==undefined).map(Number).filter(Number.isFinite);return values.length?values.reduce((total,value)=>total+value,0):null;};
  const first=field=>{const values=rows.map(row=>row?.[field]).filter(value=>value!==null&&value!==undefined).map(Number).filter(Number.isFinite);return values.length?values[0]:null;};
  const max=field=>{const values=rows.map(row=>row?.[field]).filter(value=>value!==null&&value!==undefined).map(Number).filter(Number.isFinite);return values.length?Math.max(...values):null;};
  const outputTokens=sum('outputTokens');
  const totalTimeMs=sum('totalTimeMs');
  return {
    promptTokens:sum('promptTokens'),outputTokens,totalTokens:sum('totalTokens'),
    tokensPerSecond:outputTokens&&totalTimeMs?outputTokens/(totalTimeMs/1000):null,
    timeToFirstVisibleTokenMs:first('timeToFirstVisibleTokenMs'),timeToFirstGeneratedTokenMs:first('timeToFirstGeneratedTokenMs'),totalTimeMs,
    peakSystemCpuPercent:max('peakSystemCpuPercent'),peakSingleCoreCpuPercent:max('peakSingleCoreCpuPercent'),peakGpuPercent:max('peakGpuPercent'),peakVramMb:max('peakVramMb')
  };
}
