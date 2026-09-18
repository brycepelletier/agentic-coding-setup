import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const sdk=new URL('../../agent-env-mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/',import.meta.url).href;
const {Client}=await import(sdk+'client/index.js');
const {StdioClientTransport}=await import(sdk+'client/stdio.js');
const {ListRootsRequestSchema}=await import(sdk+'types.js');
const kind=process.argv[2]||'agent-env';
const config=JSON.parse(await fs.readFile(process.env.APPDATA+'/Code/User/mcp.json','utf8'));
const entry=config.servers[kind];
const client=new Client({name:'runtime-qualification-smoke',version:'1.0.0'},{capabilities:{roots:{listChanged:false}}});
const workspace=process.argv[3];
if(!workspace)throw new Error('Usage: verify-local-mcp.mjs agent-env|github|docker ABSOLUTE_WORKSPACE [--venv] [--repository-scripts]');
client.setRequestHandler(ListRootsRequestSchema,async()=>({roots:[{uri:pathToFileURL(workspace).href,name:'agentic-coding-setup'}]}));
const transport=new StdioClientTransport({command:entry.command,args:entry.args,env:{...process.env,...entry.env},stderr:'pipe'});
// Server stderr may contain infrastructure diagnostics. Keep it out of credential-bearing logs.
transport.stderr?.on('data',()=>{});
const evidence=[];
try {
 await client.connect(transport);
 const inventory=await client.listTools();
 evidence.push({kind,tools:inventory.tools.map(t=>t.name)});
 async function call(name,args={}) {
   const response=await client.callTool({name,arguments:args},undefined,{timeout:360000});
   const value=response.content?.filter(c=>c.type==='text').map(c=>c.text).join('\n');
   console.log(JSON.stringify({name,isError:response.isError||false,value}));
   evidence.push({name,isError:response.isError||false,value}); return response;
 }
 if(kind==='agent-env') {
  const ready=await call('ensure_environment'); assert.ok(!ready.isError);
  for(const [program,args,cwd,failed] of [
   ['python3',['-c','import sys; print(sys.platform)'],'.',false],
   ['python3',['-c','print("relative cwd works")'],'scripts',false],
   ['python3',['missing-script.py'],'.',true],
   ['python3',['-c','import qualification_missing_dependency'],'.',true],
   ['python3',['-c','import sys; print("out"); print("err",file=sys.stderr); sys.exit(7)'],'.',true],
   ['missing-qualification-executable',[],'.',true],
   ['python3',[],'missing-qualification-directory',true],
   ['python3',[],'/tmp',true],
   ['git',['status'],'.',true],
   ['docker',['info'],'.',true]
  ]) { const r=await call('run_command',{program,args,cwd,timeout_seconds:15}); assert.equal(Boolean(r.isError),failed); }
  if(process.argv.includes('--venv')) {
   const dirname='.qualification-venv-'+Date.now();
   try {
    assert.ok(!(await call('run_command',{program:'python3',args:['-m','venv','--without-pip',dirname],cwd:'.',timeout_seconds:30})).isError);
    const response=await call('run_command',{program:dirname+'/bin/python',args:['-c','import sys; assert sys.prefix != sys.base_prefix; print("repository venv works")'],cwd:'.'});
    assert.ok(!response.isError);
   } finally {
    await call('run_command',{program:'python3',args:['-c','import pathlib,shutil,sys; root=pathlib.Path.cwd().resolve(); p=(root/sys.argv[1]).resolve(); assert p.parent == root and p.name.startswith(".qualification-venv-"); shutil.rmtree(p)',dirname],cwd:'.'});
   }
  }
  if(process.argv.includes('--repository-scripts')) {
   for(const script of ['scripts/build.py','scripts/upload.py','scripts/verify.py']) assert.ok(!(await call('run_command',{program:'python3',args:[script,'--help'],cwd:'.',timeout_seconds:30})).isError);
  }
 } else if(kind==='docker') {
  assert.ok(inventory.tools.some(t=>t.name==='start_runner'));
  assert.ok(!(await call('docker_status')).isError);
  assert.ok(!(await call('list_managed_resources')).isError);
 } else {
  await call('git_local',{operation:'status'});
  await call('git_remote',{operation:'auth_check',remote:'origin'});
  await call('git_remote',{operation:'ls_remote',remote:'origin'});
 }
} finally {
 await fs.writeFile(`smoke-${kind}.json`,JSON.stringify(evidence,null,2));
 await client.close();
}
