import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const mappings = [
  ['L1','Basic Authority Consistency','level-1-basic-authority-consistency.md','1'], ['L2','Basic Authority','level-1-basic-authority.md','1'],
  ['L3','Authority / Role Boundary','level-2-auth-role-boundry.md','2'], ['L4','Role Boundaries','level-2-role-boundaries.md','2'],
  ['L5','Multiconstraint State and Authority','level-3-multiconstrain-state-and-authority.md','3'], ['L6','State Authority','level-3-state-authority.md','3'],
  ['L7','Long Context','level-4-long-context.md','4'], ['L8','Long-Form Constraint Retention','level-4-long-form-constraint-retention.md','4'],
  ['L9','Self-Audit','level-4a-self-audit.md','4A'], ['L10','Repository Discovery','level-5-repository-discovery.md','5'],
  ['L11','Architecture Reconstruction','level-6-architecture-reconstruction.md','6'], ['L12','Planning Only','level-7-planning-only.md','7'],
  ['L13','Controlled Implementation','level-8-controlled-implementation.md','8']
];
const competencies = ['authority_scope','state_delegation','constraint_retention','architecture_synthesis','self_audit','repository_understanding','planning','controlled_implementation'];
const groupMap = {
  L1:[['authority_scope',1,5],['self_audit',6,6]], L2:[['authority_scope',1,5],['self_audit',6,6]],
  L3:[['authority_scope',1,10],['constraint_retention',11,15],['self_audit',16,16]], L4:[['state_delegation',1,5],['self_audit',6,6]],
  L5:[['state_delegation',1,6],['authority_scope',7,20],['state_delegation',21,24],['constraint_retention',25,30],['self_audit',31,31]],
  L6:[['state_delegation',1,6],['self_audit',7,7]]
};
const names = new Map(mappings);
for (const [id,name,filename,legacyLevel] of mappings) {
  const source = await readFile(resolve(root,'test','legacy',filename),'utf8');
  const prompt = source.match(/<!--\s*AGENT-TEST:PROMPT:BEGIN\s*-->([\s\S]*?)<!--\s*AGENT-TEST:PROMPT:END\s*-->/i)?.[1]?.trim() ?? '';
  const expectedBlock = source.match(/<!--\s*AGENT-TEST:EXPECT:BEGIN\s*-->([\s\S]*?)<!--\s*AGENT-TEST:EXPECT:END\s*-->/i)?.[1]?.trim() ?? 'RUBRIC';
  const numbered = [...prompt.matchAll(/^\s*(\d+)\.\s+(.+?)\s*$/gm)].map(match => ({number:Number(match[1]),prompt:match[2].trim()}));
  const expected = new Map([...expectedBlock.matchAll(/^\s*(\d+)\.\s+[`*]*(.+?)[`*]*\s*$/gm)].map(match => [Number(match[1]),match[2].replace(/[`*]/g,'').trim()]));
  const questions = numbered.filter(item => expected.has(item.number)).map(item => {
    const answer = expected.get(item.number); const accepted = answer.split('|').map(value=>value.trim()).filter(Boolean);
    const groups = groupMap[id] ?? []; const mapped = groups.filter(([,start,end])=>item.number>=start&&item.number<=end).map(([competency])=>competency);
    if (id === 'L5' && item.number === 6) mapped.push('authority_scope');
    const risk = id === 'L5' && item.number === 6 ? {authorityViolation:true,critical:true} : undefined;
    return {id:`Q${item.number}`,number:item.number,prompt:item.prompt,expected:accepted[0],accepted,severity:'hard',classification:'EXPECTED ANSWER MISMATCH',competencies:mapped.length?mapped:['constraint_retention'],...(risk?{risk}:{})};
  });
  const headings = source.match(/REQUIRED-HEADINGS:([^\n]+)/i)?.[1]?.split('|').map((name,index)=>({id:`S${index+1}`,name:name.trim(),order:index+1,required:true})) ?? [];
  const footers = source.match(/REQUIRED-FOOTERS:([^\n]+)/i)?.[1]?.replace(/\s*-->\s*$/,'').split('|').map((text,index)=>({id:`F${index+1}`,text:text.trim(),required:true})) ?? [];
  const forbiddenHeadings = source.match(/FORBIDDEN-HEADINGS:([^\n]+)/i)?.[1]?.split('|').map(text=>text.trim()) ?? [];
  const mode = Number(id.slice(1)) >= 10 ? 'agent-execution' : 'model-inference';
  const definition = {schemaVersion:'1.0.0',id,name,order:Number(id.slice(1)),legacy:{filename,level:legacyLevel},mode,prompt,systemPrompt:null,questions,outputContract:{requiredSections:headings,forbiddenHeadings,requiredFooters:footers},evaluation:{expectedRaw:expectedBlock,requiredSections:headings,forbiddenHeadings,requiredFooters:footers,acceptanceChecks:[{id:'A1',type:'deterministic_evaluation',required:true}],reviewRequired:Number(id.slice(1))>=7},execution:{}};
  if (id === 'L10') definition.execution={fixtures:'all',filesystemAccess:'read-only',toolProfile:'repository-read-only',evidenceRequirements:[{id:'E1',type:'file_read',required:true}],repositoryMutation:'prohibited'};
  if (id === 'L11') definition.execution={evidenceSource:'L10',prerequisites:['L10'],fallback:'reference_fallback'};
  if (id === 'L12') definition.execution={taskFixture:'telemetry-normalizer-v1',taskMode:'read-only',toolProfile:'planning-read-only',prerequisites:['L11'],requiredEvidence:['task/telemetry-normalizer/ISSUE.md'],planningComponents:['required_task_evidence','scope_affected_files','proposed_change','implementation_sequence','verification_strategy','acceptance_criteria','risk_identification','authority_no_change']};
  if (id === 'L13') definition.execution={taskFixture:'telemetry-normalizer-v1',taskMode:'disposable-writable',toolProfile:'implementation-bounded',prerequisites:['L12'],hiddenAcceptance:'normalizeMetrics(null)',implementationComponents:['authorized_file_scope','source_modification','forbidden_paths','visible_verification','hidden_acceptance','authority_tool_compliance','implementation_evidence','final_output_contract']};
  await writeFile(resolve(root,'test',`${id}.json`),JSON.stringify(definition,null,2)+'\n');
}
