#!/usr/bin/env node
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { showHelp, validateArguments, wantsHelp } from './cli-arguments.mjs';
import { loadDashboardConfig } from './dashboard-config.mjs';

const args = process.argv.slice(2);
const HELP = `
Usage: test.mjs dashboard [--results DIR] [--host HOST] [--port PORT]

Serve the live Agent Evaluation Platform dashboard.

Options:
  --results DIR   Results directory; default platform results/.
  --host HOST     Bind host; default config/dashboard.json.
  --port PORT     HTTP port; default 3000.
  -h, --help      Show this help.
`;
if (wantsHelp(args)) showHelp(HELP);
try { validateArguments(args, { valueOptions:['--results','--host','--port'], maxPositionals:0 }); }
catch (error) { showHelp(HELP, error.message); }
const get = name => { const index=args.findIndex(value=>value===name || value.startsWith(`${name}=`)); return index<0 ? undefined : (args[index].includes('=') ? args[index].slice(name.length+1) : args[index+1]); };
const config = await loadDashboardConfig({ bindHost:get('--host'), port:get('--port') });
const resultsRoot = resolve(get('--results') ?? fileURLToPath(new URL('../results/', import.meta.url)));
const server = createServer(async (request, response) => {
  try { await route(request, response); }
  catch (error) { sendJson(response, 500, { error:error.message }); }
});
const clients = new Set();
let lastBroadcastSignature = '';
server.on('upgrade', (request, socket) => {
  if (new URL(request.url, 'http://dashboard.local').pathname !== '/live') return socket.destroy();
  const key = request.headers['sec-websocket-key'];
  if (!key) return socket.destroy();
  const accept = createHash('sha1').update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  clients.add(socket);
  socket.on('error', () => clients.delete(socket));
  socket.on('close', () => clients.delete(socket));
  socket.on('data', data => { if ((data[0] & 0x0f) === 0x8) socket.end(); });
  sendCurrent(socket).catch(() => socket.destroy());
});
setInterval(() => broadcastCurrent().catch(() => {}), config.pollIntervalMs).unref();
server.listen(config.port, config.bindHost, () => {
  const address = server.address();
  console.log(`Dashboard listening at http://${config.bindHost}:${address.port}`);
  console.log(`Watching results: ${resultsRoot}`);
});

async function route(request, response) {
  const url = new URL(request.url, 'http://dashboard.local');
  if (url.pathname === '/api/health') return sendJson(response, 200, { status:'ok', resultsRoot });
  if (url.pathname === '/api/runs') return sendJson(response, 200, await listRuns());
  if (url.pathname === '/api/runs/current') {
    const runs = await listRuns();
    if (!runs.length) return sendJson(response, 404, { error:'No qualification runs found' });
    return sendJson(response, 200, await readRun(runs[0].runId));
  }
  const runMatch = url.pathname.match(/^\/api\/runs\/([a-zA-Z0-9_-]+)$/);
  if (runMatch) return sendJson(response, 200, await readRun(runMatch[1]));
  if (url.pathname === '/' || url.pathname === '/index.html') return sendHtml(response, DASHBOARD_HTML);
  sendJson(response, 404, { error:'Not found' });
}

async function listRuns() {
  let entries = [];
  try { entries = await readdir(resultsRoot, { withFileTypes:true }); }
  catch (error) { if (error.code === 'ENOENT') return []; else throw error; }
  const runs = [];
  for (const entry of entries.filter(value => value.isDirectory())) {
    const file = resolve(resultsRoot, entry.name, 'run.json');
    try {
      const [run, details] = await Promise.all([readJson(file), stat(file)]);
      runs.push({ runId:run.runId ?? entry.name, generatedAt:run.generatedAt ?? details.mtime.toISOString(), status:run.status ?? 'completed', models:run.models?.length ?? 0 });
    } catch { /* an incomplete directory is not a dashboard run yet */ }
  }
  return runs.sort((left, right) => String(right.generatedAt).localeCompare(String(left.generatedAt)));
}

async function readRun(runId) {
  if (basename(runId) !== runId) throw new Error('Invalid run identifier');
  const run = await readJson(resolve(resultsRoot, runId, 'run.json'));
  try {
    const progress = await readJson(resolve(resultsRoot, runId, 'live-progress.json'));
    if (!progress.runId || progress.runId === run.runId) run.liveProgress = progress;
  } catch { /* progress exists only while a request is active */ }
  return run;
}
async function currentSnapshot() {
  const runs = await listRuns();
  return { type:'snapshot', runs, run:runs.length ? await readRun(runs[0].runId) : null };
}
async function sendCurrent(socket) { sendWebSocket(socket, await currentSnapshot()); }
async function broadcastCurrent() {
  if (!clients.size) return;
  const snapshot = await currentSnapshot();
  const signature = JSON.stringify([snapshot.runs, snapshot.run?.updatedAt, snapshot.run?.liveProgress?.updatedAt, snapshot.run?.status]);
  if (signature === lastBroadcastSignature) return;
  lastBroadcastSignature = signature;
  for (const socket of clients) {
    if (socket.destroyed) clients.delete(socket);
    else sendWebSocket(socket, snapshot);
  }
}
function sendWebSocket(socket, value) {
  const payload = Buffer.from(JSON.stringify(value));
  let header;
  if (payload.length < 126) header = Buffer.from([0x81, payload.length]);
  else if (payload.length <= 0xffff) { header = Buffer.alloc(4); header[0]=0x81; header[1]=126; header.writeUInt16BE(payload.length, 2); }
  else { header = Buffer.alloc(10); header[0]=0x81; header[1]=127; header.writeBigUInt64BE(BigInt(payload.length), 2); }
  socket.write(Buffer.concat([header, payload]));
}
async function readJson(file) { return JSON.parse(await readFile(file, 'utf8')); }
function sendJson(response, status, value) { response.writeHead(status, { 'content-type':'application/json; charset=utf-8', 'cache-control':'no-store' }); response.end(JSON.stringify(value)); }
function sendHtml(response, html) { response.writeHead(200, { 'content-type':'text/html; charset=utf-8', 'cache-control':'no-store' }); response.end(html); }

const DASHBOARD_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Agent Evaluation Platform</title><style>
:root{color-scheme:dark;--bg:#08111f;--panel:#101c2d;--line:#263850;--text:#edf5ff;--muted:#90a4bd;--cyan:#42d7e8;--green:#5ee6a8;--red:#ff7185;--amber:#ffc766;--blue:#669cff}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 10% 0,#132b48 0,transparent 32%),var(--bg);color:var(--text);font:14px/1.45 Inter,ui-sans-serif,system-ui,sans-serif}main{max-width:1440px;margin:auto;padding:28px}header{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;margin-bottom:22px}h1{font-size:clamp(25px,4vw,44px);margin:0;letter-spacing:-.04em}h2{font-size:19px;margin:0}.eyebrow{color:var(--cyan);font-size:12px;font-weight:800;letter-spacing:.16em;text-transform:uppercase}.muted{color:var(--muted)}select{background:#0a1525;color:var(--text);border:1px solid var(--line);border-radius:9px;padding:9px 12px}.status{display:flex;align-items:center;gap:8px}.dot{width:9px;height:9px;border-radius:50%;background:var(--amber);box-shadow:0 0 14px currentColor}.dot.live{background:var(--green)}.stats{display:grid;grid-template-columns:repeat(5,minmax(120px,1fr));gap:12px;margin:20px 0}.stat,.model{background:linear-gradient(155deg,rgba(20,38,61,.92),rgba(11,23,39,.96));border:1px solid var(--line);border-radius:14px;box-shadow:0 18px 45px rgba(0,0,0,.2)}.stat{padding:16px}.stat strong{display:block;font-size:25px;margin-top:3px}.models{display:grid;gap:16px}.model{padding:18px}.model-head{display:flex;justify-content:space-between;gap:16px;align-items:center;margin-bottom:13px}.badge{border:1px solid var(--line);border-radius:99px;padding:4px 9px;font-size:11px;text-transform:uppercase;letter-spacing:.08em}.running{color:var(--cyan)}.pass{color:var(--green)}.fail{color:var(--red)}.review_required,.pass_with_discrepancy{color:var(--amber)}.skipped{color:var(--muted)}table{width:100%;border-collapse:collapse}th,td{padding:9px 10px;border-top:1px solid var(--line);text-align:left;vertical-align:top}th{color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.07em}.active{border-left:3px solid var(--cyan);padding-left:10px;margin:10px 0;color:var(--cyan)}.stream{background:#07111f;border:1px solid #1f4960;border-radius:10px;padding:12px;margin:10px 0}.stream-grid{display:flex;flex-wrap:wrap;gap:18px;margin-bottom:7px}.preview{font:12px/1.4 ui-monospace,SFMono-Regular,Consolas,monospace;color:#b9d7e8;white-space:pre-wrap;max-height:100px;overflow:hidden}.empty{text-align:center;padding:80px 20px;border:1px dashed var(--line);border-radius:14px;color:var(--muted)}@media(max-width:850px){main{padding:18px}.stats{grid-template-columns:repeat(2,1fr)}header{align-items:flex-start;flex-direction:column}.table-wrap{overflow:auto}}
</style></head><body><main><header><div><div class="eyebrow">Live qualification telemetry</div><h1>Agent Evaluation Platform</h1><div id="runMeta" class="muted">Waiting for a run…</div></div><div><div class="status"><span id="liveDot" class="dot"></span><span id="connection">Connecting</span></div><select id="runSelect" aria-label="Qualification run"></select></div></header><section id="stats" class="stats"></section><section id="models" class="models"><div class="empty">Waiting for qualification evidence…</div></section></main><script>
let selected=null;const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function json(path){const response=await fetch(path,{cache:'no-store'});if(!response.ok)throw new Error(await response.text());return response.json()}
function metric(v,s=''){return v===null||v===undefined?'—':Number(v).toLocaleString(undefined,{maximumFractionDigits:2})+s}
function summary(run){const results=(run.models||[]).flatMap(m=>m.qualificationResults||[]);return{models:(run.models||[]).length,tests:results.filter(r=>r.result!=='skipped').length,pass:results.filter(r=>['pass','pass_with_discrepancy'].includes(r.result)).length,fail:results.filter(r=>r.result==='fail').length,score:run.weighted?.candidates?.[0]?.score}}
function updateRuns(runs){const select=document.getElementById('runSelect');if(!selected)selected=new URLSearchParams(location.search).get('run')||runs[0]?.runId;if(!runs.some(r=>r.runId===selected))selected=runs[0]?.runId;select.innerHTML=runs.map(r=>'<option value="'+esc(r.runId)+'" '+(r.runId===selected?'selected':'')+'>'+esc(r.runId)+' · '+esc(r.status)+'</option>').join('');select.onchange=async()=>{selected=select.value;history.replaceState(null,'','?run='+encodeURIComponent(selected));try{render(await json('/api/runs/'+encodeURIComponent(selected)))}catch{}}}
function render(run){const s=summary(run);document.getElementById('runMeta').textContent='Run '+run.runId+' · '+(run.status||'running')+' · '+new Date(run.generatedAt).toLocaleString();document.getElementById('stats').innerHTML=[['Models',s.models],['Tests completed',s.tests],['Pass',s.pass],['Fail',s.fail],['Top weighted score',s.score??'—']].map(([k,v])=>'<div class="stat"><span class="muted">'+k+'</span><strong>'+esc(v)+'</strong></div>').join('');document.getElementById('models').innerHTML=(run.models||[]).map(model=>{const rows=(model.qualificationResults||[]).map(r=>'<tr><td>L'+esc(r.level)+'</td><td>'+esc(r.test)+'</td><td class="'+esc(r.result)+'">'+esc(String(r.result).toUpperCase())+'</td><td>'+esc((r.discrepancies||[]).map(d=>d.question?'Q'+d.question+' '+d.classification:d.classification).join('; '))+'</td><td>'+metric(r.performance?.tokensPerSecond)+'</td><td>'+metric(r.performance?.timeToFirstVisibleTokenMs,' ms')+'</td></tr>').join('');const active=model.activeTest?'<div class="active">Running L'+esc(model.activeTest.level)+' — '+esc(model.activeTest.test)+'</div>':'';const p=run.liveProgress?.model===(model.model||'offline')?run.liveProgress:null;const stream=p?'<div class="stream"><div class="stream-grid"><strong>'+esc(p.stage)+'</strong><span>Visible: '+metric(p.visibleCharacters||0)+' chars</span><span>Reasoning: '+metric(p.reasoningCharacters||0)+' chars</span><span>Elapsed: '+metric(p.elapsedMs,' ms')+'</span></div><div class="preview">'+esc(p.visiblePreview||p.reasoningPreview||'Waiting for generated content…')+'</div></div>':'';return '<article class="model"><div class="model-head"><div><div class="eyebrow">Candidate</div><h2>'+esc(model.model||'Offline response')+'</h2></div><span class="badge '+esc(model.status)+'">'+esc(model.status||'running')+'</span></div>'+active+stream+'<div class="table-wrap"><table><thead><tr><th>Level</th><th>Test</th><th>Result</th><th>Discrepancies</th><th>tok/s</th><th>Visible TTFT</th></tr></thead><tbody>'+rows+'</tbody></table></div></article>'}).join('')||'<div class="empty">The run is initialized. Waiting for the first candidate…</div>'}
async function initial(){try{const runs=await json('/api/runs');updateRuns(runs);if(selected)render(await json('/api/runs/'+encodeURIComponent(selected)))}catch{}}function connect(){const protocol=location.protocol==='https:'?'wss:':'ws:';const socket=new WebSocket(protocol+'//'+location.host+'/live');socket.onopen=()=>{document.getElementById('liveDot').classList.add('live');document.getElementById('connection').textContent='WebSocket live'};socket.onmessage=event=>{const message=JSON.parse(event.data);if(message.type!=='snapshot')return;updateRuns(message.runs||[]);if(message.run?.runId===selected)render(message.run)};socket.onclose=()=>{document.getElementById('liveDot').classList.remove('live');document.getElementById('connection').textContent='Reconnecting';setTimeout(connect,1000)};socket.onerror=()=>socket.close()}initial();connect();
</script></body></html>`;
