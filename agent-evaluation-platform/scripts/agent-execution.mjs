import { getInferenceAdapter } from './inference-adapters.mjs';
import { queryModel } from './llm-client.mjs';
import { agentToolDefinitions, executeAgentTool } from './execution-environment.mjs';

export async function executeAgentQualification({ target, messages, environment, onProgress, maxTurns = environment.maxAgentTurns ?? 32 }) {
  const adapter=getInferenceAdapter(target.protocol);
  if (environment.toolNames.length && !adapter.supportsToolCalls) throw new InvalidAgentEnvironmentError(`protocol ${target.protocol} does not expose tool-call semantics`);
  const tools=agentToolDefinitions(environment.toolNames);
  const executionContent=[
      'Controlled agent execution environment:',
      `- Workspace root: ${environment.workspace}`,
      `- Reference fixtures: ${environment.manifest.fixtures.map(fixture=>fixture.workspacePath).join(', ') || '(none exposed)'}`,
      `- Task fixture: ${environment.task?.workspacePath ?? '(none)'}`,
      `- Evidence source: ${environment.evidenceSource ?? 'direct inspection'}`,
      ...(environment.referenceArtifacts?.length ? [`- Suite evidence artifacts: ${environment.referenceArtifacts.map(item=>item.workspacePath).join(', ')}`] : []),
      '- Use the supplied tools to inspect real files. Do not claim a path unless a tool established it.',
      ...(environment.manifest.fixtures.length ? ['- Cite repository evidence only in canonical backticks as `fixtures/<repository>/<path>`.','- Reference fixtures are read-only. Before the final answer, run `git status --short` in each fixture repository.'] : []),
      ...(environment.task?.mode==='read-only' ? ['- The task fixture is planning-only and MUST remain unchanged.'] : []),
      ...(environment.task?.mode==='disposable-writable' ? [`- Write authority is limited to: ${environment.task.permittedWrites.map(path=>`${environment.task.workspacePath}/${path}`).join(', ')}.`,`- Git and GitHub operations are not exposed or authorized.`] : [])
    ].join('\n');
  // Some chat templates reject any system message after the first. Merge the
  // controlled-execution contract into the sole initial system message.
  const transcript = messages.length && messages[0]?.role === 'system'
    ? [{ ...messages[0], content:`${messages[0].content}\n\n${executionContent}` }, ...messages.slice(1)]
    : [{ role:'system', content:executionContent }, ...messages];
  if (environment.priorEvidence) {
    const prior = `Frozen prior-stage evidence (SHA-256 ${environment.priorEvidence.sha256}; source ${environment.evidenceSource}):\n${JSON.stringify(environment.priorEvidence.content ?? environment.priorEvidence,null,2)}`;
    transcript[0] = { ...transcript[0], content:`${transcript[0].content}\n\n${prior}` };
  }
  const turns=[];
  const toolEvidence=[];
  const raw=[];
  let final=null;
  for (let turn=1;turn<=maxTurns;turn++) {
    onProgress?.({ stage:'agent_turn',turn,elapsedMs:0 });
    let result;
    try { result=await queryModel({ target,input:{ messages:transcript,...(tools.length?{tools,toolChoice:'auto'}:{}) },onProgress,signal:AbortSignal.timeout(environment.turnTimeoutMs??300000) }); }
    catch (error) { const reason=['TimeoutError','AbortError'].includes(error.name)?'timeout':'inference_error'; throw new ExecutionIncompleteError(`inference terminated before a final answer: ${error.message}`,{reason,turns,toolEvidence,transcript,raw,error:error.message}); }
    raw.push(`--- AGENT TURN ${turn} ---\n${result.rawBackendEvidence?.body ?? ''}`);
    turns.push({ turn,inference:result.inference,visibleResponse:result.visibleResponse,reasoningResponse:result.reasoningResponse,finishReason:result.finishReason,toolCalls:result.toolCalls,performance:result.performance });
    if (result.finishReason==null) throw new ExecutionIncompleteError('inference ended without finish evidence',{reason:'missing_finish_reason',turns,toolEvidence,transcript,raw,lastResult:result});
    if (!result.toolCalls?.length) {
      if (result.finishReason==='tool_calls') throw new ExecutionIncompleteError('inference declared a tool call but supplied no complete call',{reason:'unfinished_tool_call',turns,toolEvidence,transcript,raw,lastResult:result});
      final=result; break;
    }
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
  if (!final) throw new ExecutionIncompleteError(`agent execution exceeded ${maxTurns} turns without a final answer`,{reason:'turn_limit',maxTurns,turns,toolEvidence,transcript,raw});
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

export class ExecutionIncompleteError extends Error {
  constructor(message,evidence) { super(message); this.name='ExecutionIncompleteError'; this.evidence=evidence; }
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
