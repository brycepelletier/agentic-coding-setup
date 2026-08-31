import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { access, mkdir, readFile, readdir, stat } from 'node:fs/promises';
import { basename, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultConfigFile = fileURLToPath(new URL('../config/execution-contracts.json', import.meta.url));
const platformRoot = fileURLToPath(new URL('../', import.meta.url));

export async function loadExecutionContracts(file = defaultConfigFile) {
  const config=JSON.parse(await readFile(file,'utf8'));
  if (!config.executionVersion || !config.tests || !config.toolProfiles) throw new Error('Invalid execution-contract configuration');
  return config;
}

export function executionContractFor(config, testFile) {
  return config.tests?.[basename(testFile)] ?? { mode:'model-inference' };
}

export function invalidEnvironment({ testFile, contract, reasons, executionVersion }) {
  return {
    result:'invalid_environment',
    discrepancies:[],
    hardFailureCount:0,
    rubricReviewRequired:false,
    infrastructure:{
      valid:false,
      outcome:'invalid_environment',
      test:basename(testFile),
      executionMode:contract?.mode ?? 'unknown',
      executionVersion:executionVersion ?? null,
      reasons:[...new Set(reasons.filter(Boolean))]
    }
  };
}

export async function prepareExecutionEnvironment({ config, contract, workspace, fixtureSourceRoot, priorResultFile }) {
  const reasons=[];
  if (contract.mode !== 'agent-execution') return { valid:true, mode:'model-inference' };
  if (!contract.toolProfile || !config.toolProfiles[contract.toolProfile]) reasons.push('required tool profile is not configured');
  if (contract.authorizedImplementation === null && contract.repositoryMutation === 'authorized-implementation-only') reasons.push('authorized implementation repository is not configured');
  if ('task' in contract && !contract.task) reasons.push('concrete implementation task is not configured');
  let priorEvidence=null;
  if (contract.priorEvidence) {
    if (!priorResultFile) reasons.push(`required prior evidence ${contract.priorEvidence} was not supplied`);
    else {
      try {
        priorEvidence=JSON.parse(await readFile(priorResultFile,'utf8'));
        if (!['pass','pass_with_discrepancy','reviewed'].includes(priorEvidence.result) || priorEvidence.executionEvidence?.valid !== true) reasons.push(`prior evidence ${contract.priorEvidence} is not valid agent-execution evidence`);
      } catch { reasons.push(`required prior evidence ${contract.priorEvidence} could not be read`); }
    }
  }
  if (reasons.length) return { valid:false,reasons,priorEvidence };
  try { await runCommand('git',['--version'],platformRoot); }
  catch { return { valid:false,reasons:['required Git command is unavailable'],priorEvidence }; }
  try {
    const manifest=await materializeFixtures({ config, workspace, fixtureSourceRoot });
    return { valid:true,mode:'agent-execution',workspace:resolve(workspace),manifest,priorEvidence,toolNames:config.toolProfiles[contract.toolProfile] };
  } catch (error) {
    return { valid:false,reasons:[`fixture materialization failed: ${error.message}`],priorEvidence };
  }
}

export async function verifyExecutionEnvironment(environment) {
  if (!environment?.valid || !environment.manifest) return { valid:false,fixtures:[] };
  const fixtures=[];
  for (const fixture of environment.manifest.fixtures) {
    const current=await fixtureState(fixture.path);
    fixtures.push({
      name:fixture.name,
      path:fixture.path,
      commit:current.commit,
      expectedCommit:fixture.commit,
      status:current.status,
      trackedTreeHash:current.trackedTreeHash,
      unchanged:current.commit===fixture.commit && current.status==='' && current.trackedTreeHash===fixture.trackedTreeHash,
      verification:{ command:'git status --short', result:current.status || '(clean)' }
    });
  }
  return { valid:fixtures.every(fixture=>fixture.unchanged),fixtures,capturedAt:new Date().toISOString() };
}

export function agentToolDefinitions(toolNames) {
  const definitions={
    list_directory:{ description:'List files and directories at a path inside the controlled workspace.',parameters:{ type:'object',properties:{ path:{type:'string'} },required:['path'],additionalProperties:false } },
    read_file:{ description:'Read a UTF-8 text file inside the controlled workspace.',parameters:{ type:'object',properties:{ path:{type:'string'} },required:['path'],additionalProperties:false } },
    search_files:{ description:'Search workspace text files for a literal string and return matching paths and lines.',parameters:{ type:'object',properties:{ path:{type:'string'},query:{type:'string'} },required:['path','query'],additionalProperties:false } },
    run_command:{ description:'Run one permitted read-only Git command in a fixture repository. Allowed forms: git status --short, git status --porcelain, git diff --exit-code, git diff --cached --exit-code, git rev-parse HEAD, git ls-files.',parameters:{ type:'object',properties:{ cwd:{type:'string'},command:{type:'string',enum:['git']},args:{type:'array',items:{type:'string'}} },required:['cwd','command','args'],additionalProperties:false } }
  };
  return toolNames.map(name=>({ type:'function',function:{ name,...definitions[name] } }));
}

export async function executeAgentTool({ name, arguments:input }, environment) {
  const startedAt=new Date().toISOString();
  let parsed;
  try { parsed=typeof input==='string' ? JSON.parse(input||'{}') : (input??{}); }
  catch (error) { return evidence(name,input,startedAt,{ ok:false,error:`Invalid JSON arguments: ${error.message}` }); }
  try {
    let output;
    if (name==='list_directory') output=await listDirectory(resolveWorkspacePath(environment.workspace,parsed.path));
    else if (name==='read_file') output=await readWorkspaceFile(resolveWorkspacePath(environment.workspace,parsed.path));
    else if (name==='search_files') output=await searchFiles(resolveWorkspacePath(environment.workspace,parsed.path),parsed.query);
    else if (name==='run_command') output=await executeBoundedCommand(parsed,environment.workspace);
    else throw new Error(`Tool ${name} is not permitted`);
    return evidence(name,parsed,startedAt,{ ok:true,output });
  } catch (error) { return evidence(name,parsed,startedAt,{ ok:false,error:error.message }); }
}

export async function validateLevel5Evidence({ response, environment, toolEvidence }) {
  const discrepancies=[];
  const citations=extractPathCitations(response);
  if (!citations.length) discrepancies.push({ type:'missing_repository_evidence',severity:'hard',classification:'MISSING REPOSITORY EVIDENCE',observed:'No canonical fixtures/<repository>/<path> citations were found' });
  for (const citation of citations) {
    try { await stat(resolveWorkspacePath(environment.workspace,citation)); }
    catch { discrepancies.push({ type:'fabricated_repository_path',severity:'hard',classification:'FABRICATED REPOSITORY PATH',observed:citation }); }
  }
  const citedRepositories=new Set(citations.map(path=>path.split('/')[1]));
  for (const fixture of environment.manifest.fixtures) {
    if (!citedRepositories.has(fixture.name)) discrepancies.push({ type:'missing_fixture_coverage',severity:'hard',classification:'FIXTURE EVIDENCE MISSING',observed:fixture.name });
  }
  const gitVerification=toolEvidence.filter(item=>item.name==='run_command'&&item.arguments?.command==='git'&&['status --short','status --porcelain'].includes((item.arguments.args??[]).join(' '))&&item.result?.ok);
  for (const fixture of environment.manifest.fixtures) {
    const fixturePath=resolve(fixture.path);
    const verified=gitVerification.some(item=>resolveWorkspacePath(environment.workspace,item.arguments.cwd)===fixturePath);
    if (!verified) discrepancies.push({ type:'missing_worktree_verification',severity:'hard',classification:'WORKTREE VERIFICATION MISSING',observed:fixture.name });
  }
  const post=await verifyExecutionEnvironment(environment);
  for (const fixture of post.fixtures.filter(item=>!item.unchanged)) discrepancies.push({ type:'fixture_modified',severity:'hard',classification:'FIXTURE MUTATION',observed:fixture.name });
  return { discrepancies,postExecution:post,citations };
}

async function materializeFixtures({ config,workspace,fixtureSourceRoot }) {
  const root=resolve(workspace);
  const fixtureRoot=resolve(root,'fixtures');
  await mkdir(fixtureRoot,{recursive:true});
  const fixtures=[];
  for (const fixture of config.fixtureRepositories) {
    const destination=resolve(fixtureRoot,fixture.name);
    let exists=false;
    try { await access(resolve(destination,'.git')); exists=true; } catch {}
    if (!exists) {
      const source=await fixtureSource(fixture,fixtureSourceRoot);
      await runCommand('git',['clone','--no-checkout',source,destination],root);
    }
    await runCommand('git',['checkout','--detach',fixture.commit],destination);
    const state=await fixtureState(destination);
    if (state.commit!==fixture.commit) throw new Error(`${fixture.name} resolved to ${state.commit}, expected ${fixture.commit}`);
    if (state.status) throw new Error(`${fixture.name} is not clean after materialization`);
    fixtures.push({ name:fixture.name,url:fixture.url,path:destination,workspacePath:`fixtures/${fixture.name}`,commit:state.commit,status:state.status,trackedTreeHash:state.trackedTreeHash });
  }
  return { schemaVersion:'1.0.0',executionVersion:config.executionVersion,workspace:root,fixtures,createdAt:new Date().toISOString() };
}

async function fixtureSource(fixture,explicitRoot) {
  const candidates=[explicitRoot,process.env.AGENT_EVAL_FIXTURE_SOURCE_ROOT,resolve(platformRoot,'..','..')].filter(Boolean);
  for (const root of candidates) {
    const candidate=resolve(root,fixture.name);
    try { await access(resolve(candidate,'.git')); return candidate; } catch {}
  }
  return fixture.url;
}

async function fixtureState(path) {
  const [commit,status,tracked]=await Promise.all([
    runCommand('git',['rev-parse','HEAD'],path),
    runCommand('git',['status','--short'],path),
    runCommand('git',['ls-files','-s'],path)
  ]);
  return { commit:commit.trim(),status:status.trim(),trackedTreeHash:createHash('sha256').update(tracked).digest('hex') };
}

function resolveWorkspacePath(workspace,value='.') {
  const root=resolve(workspace);
  const resolved=resolve(root,String(value).replaceAll('/',sep));
  if (resolved!==root && !resolved.startsWith(`${root}${sep}`)) throw new Error('Path escapes the controlled workspace');
  if (relative(root,resolved).split(sep).includes('.git')) throw new Error('Direct .git access is not permitted');
  return resolved;
}

async function listDirectory(path) {
  const entries=await readdir(path,{withFileTypes:true});
  return entries.filter(entry=>entry.name!=='.git'&&entry.name!=='node_modules').slice(0,500).map(entry=>`${entry.isDirectory()?'directory':'file'}\t${entry.name}`).join('\n');
}
async function readWorkspaceFile(path) {
  const details=await stat(path);
  if (!details.isFile()) throw new Error('Path is not a file');
  if (details.size>262144) throw new Error('File exceeds the 256 KiB read limit');
  return readFile(path,'utf8');
}
async function searchFiles(root,query) {
  if (!query) throw new Error('Search query is required');
  const matches=[];
  await walk(root,async path=>{
    if (matches.length>=200) return;
    let text;
    try { text=await readWorkspaceFile(path); } catch { return; }
    for (const [index,line] of text.split(/\r?\n/).entries()) if (line.includes(query)) {
      matches.push(`${relative(root,path).replaceAll('\\','/')}:${index+1}:${line.slice(0,500)}`);
      if (matches.length>=200) break;
    }
  });
  return matches.join('\n') || '(no matches)';
}
async function walk(directory,visit) {
  for (const entry of await readdir(directory,{withFileTypes:true})) {
    if (entry.name==='.git'||entry.name==='node_modules') continue;
    const path=resolve(directory,entry.name);
    if (entry.isDirectory()) await walk(path,visit);
    else if (entry.isFile()) await visit(path);
  }
}
async function executeBoundedCommand(input,workspace) {
  if (input.command!=='git') throw new Error('Only Git is permitted');
  const signature=(input.args??[]).join(' ');
  const allowed=new Set(['status --short','status --porcelain','diff --exit-code','diff --cached --exit-code','rev-parse HEAD','ls-files']);
  if (!allowed.has(signature)) throw new Error(`Command is outside the read-only allowlist: git ${signature}`);
  const cwd=resolveWorkspacePath(workspace,input.cwd);
  return runCommand('git',input.args,cwd);
}
function runCommand(command,args,cwd) {
  return new Promise((resolveRun,reject)=>{
    const child=spawn(command,args,{cwd,stdio:['ignore','pipe','pipe'],shell:false,windowsHide:true});
    let stdout='',stderr='';
    child.stdout.setEncoding('utf8').on('data',chunk=>stdout+=chunk);
    child.stderr.setEncoding('utf8').on('data',chunk=>stderr+=chunk);
    child.on('error',reject);
    child.on('exit',code=>code===0?resolveRun(stdout):reject(new Error(`${command} ${args.join(' ')} exited ${code}: ${stderr.trim()}`)));
  });
}
function extractPathCitations(response) {
  const paths=new Set();
  for (const match of String(response).matchAll(/`([^`\r\n]+)`/g)) if (/^fixtures\/[A-Za-z0-9._-]+\/.+/.test(match[1])) paths.add(match[1]);
  return [...paths];
}
function evidence(name,args,startedAt,result) { return { name,arguments:args,startedAt,completedAt:new Date().toISOString(),result }; }
