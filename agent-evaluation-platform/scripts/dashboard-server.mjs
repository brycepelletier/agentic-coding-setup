#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile, readdir, stat } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { showHelp, validateArguments, wantsHelp } from './cli-arguments.mjs';
import { loadDashboardConfig } from './dashboard-config.mjs';
import { loadAllTestDefinitions } from './test-definitions.mjs';

const args = process.argv.slice(2);
const HELP = `
Usage: test.mjs dashboard [--results DIR] [--targets FILE] [--host HOST] [--port PORT] [--idle-timeout-ms MS]

Serve the live Agent Evaluation Platform dashboard.

Options:
  --results DIR          Results directory; default platform results/.
  --targets FILE         Candidate configuration shown before a run exists.
  --host HOST            Bind host; default config/dashboard.json.
  --port PORT            HTTP port; default 3000.
  --idle-timeout-ms MS   Stop after no WebSocket clients for this duration; default 900000.
  -h, --help             Show this help.
`;
if (wantsHelp(args)) showHelp(HELP);
try { validateArguments(args, { valueOptions:['--results','--targets','--host','--port','--idle-timeout-ms'], maxPositionals:0 }); }
catch (error) { showHelp(HELP, error.message); }

const get = name => { const index=args.findIndex(value=>value===name || value.startsWith(`${name}=`)); return index<0 ? undefined : (args[index].includes('=') ? args[index].slice(name.length+1) : args[index+1]); };
const config = await loadDashboardConfig({ bindHost:get('--host'), port:get('--port'), idleShutdownMs:get('--idle-timeout-ms') });
const resultsRoot = resolve(get('--results') ?? fileURLToPath(new URL('../results/', import.meta.url)));
const targetsFile = resolve(get('--targets') ?? fileURLToPath(new URL('../config/targets/local-llm-models.json', import.meta.url)));
const testRoot = fileURLToPath(new URL('../test/', import.meta.url));
const dashboardRoot = fileURLToPath(new URL('../dashboard/', import.meta.url));
const manifest = await loadManifest();
const clients = new Set();
let lastBroadcastSignature = '';
let idleTimer = null;
let shuttingDown = false;

const server = createServer(async (request, response) => {
  try { await route(request, response); }
  catch (error) { sendJson(response, error.statusCode ?? 500, { error:error.message }); }
});

server.on('upgrade', (request, socket) => {
  if (new URL(request.url, 'http://dashboard.local').pathname !== '/live' || shuttingDown) return socket.destroy();
  const key = request.headers['sec-websocket-key'];
  if (!key) return socket.destroy();
  const accept = createHash('sha1').update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  clients.add(socket);
  cancelIdleShutdown();
  let removed=false;
  const remove = () => { if (removed) return; removed=true; clients.delete(socket); scheduleIdleShutdown(); };
  socket.once('error', remove);
  socket.once('close', remove);
  socket.on('data', data => { if ((data[0] & 0x0f) === 0x8) socket.end(); });
  sendCurrent(socket).catch(() => socket.destroy());
});

const broadcastTimer = setInterval(() => broadcastCurrent().catch(() => {}), config.pollIntervalMs);
broadcastTimer.unref();
server.listen(config.port, config.bindHost, () => {
  const address = server.address();
  console.log(`Dashboard listening at http://${config.bindHost}:${address.port}`);
  console.log(`Watching results: ${resultsRoot}`);
  console.log(`Idle shutdown: ${Math.round(config.idleShutdownMs / 60000)} minutes without a live browser connection`);
  scheduleIdleShutdown();
});
process.once('SIGINT', () => beginShutdown('SIGINT'));
process.once('SIGTERM', () => beginShutdown('SIGTERM'));

async function route(request, response) {
  const url = new URL(request.url, 'http://dashboard.local');
  if (url.pathname === '/api/health') return sendJson(response, 200, { status:shuttingDown?'shutting_down':'ok', resultsRoot, clients:clients.size, idleShutdownMs:config.idleShutdownMs });
  if (url.pathname === '/api/bootstrap') return sendJson(response, 200, await currentSnapshot());
  if (url.pathname === '/api/runs') return sendJson(response, 200, await listRuns());
  if (url.pathname === '/api/runs/current') {
    const runs = await listRuns();
    if (!runs.length) return sendJson(response, 404, { error:'No qualification runs found' });
    return sendJson(response, 200, await readRun(runs[0].runId));
  }
  const candidateMatch = url.pathname.match(/^\/api\/runs\/([a-zA-Z0-9_-]+)\/candidates\/([^/]+)$/);
  if (candidateMatch) return sendJson(response, 200, await readCandidate(candidateMatch[1], decodeURIComponent(candidateMatch[2])));
  const runMatch = url.pathname.match(/^\/api\/runs\/([a-zA-Z0-9_-]+)$/);
  if (runMatch) return sendJson(response, 200, await readRun(runMatch[1]));
  if (url.pathname === '/api/shutdown') {
    if (request.method !== 'POST') return sendJson(response, 405, { error:'Use POST to shut down the dashboard' });
    sendJson(response, 202, { status:'shutting_down' });
    setImmediate(() => beginShutdown('requested from dashboard'));
    return;
  }
  if (url.pathname === '/assets/dashboard.css') return sendAsset(response, 'dashboard.css', 'text/css; charset=utf-8');
  if (url.pathname === '/assets/dashboard.js') return sendAsset(response, 'dashboard.js', 'text/javascript; charset=utf-8');
  if (url.pathname === '/' || url.pathname === '/index.html' || url.pathname === '/candidate') return sendAsset(response, 'index.html', 'text/html; charset=utf-8');
  sendJson(response, 404, { error:'Not found' });
}

async function loadManifest() {
  const [definitions, targetConfiguration] = await Promise.all([
    loadAllTestDefinitions(),
    readJson(targetsFile).catch(error => error.code === 'ENOENT' ? { targets:[] } : Promise.reject(error))
  ]);
  const tests = definitions.map(definition => ({ test:definition.id, testId:definition.id, name:definition.name, level:definition.id }));
  const candidates = Array.isArray(targetConfiguration) ? targetConfiguration : (targetConfiguration.targets ?? []);
  return { candidates:candidates.map(({ name,model,protocol }) => ({ name:name??model, model, protocol:protocol??null })), tests };
}

async function listRuns() {
  let entries = [];
  try { entries = await readdir(resultsRoot, { withFileTypes:true }); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
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
  validateSegment(runId, 'run identifier');
  const run = await readJson(resolve(resultsRoot, runId, 'run.json'));
  try {
    const progress = await readJson(resolve(resultsRoot, runId, 'live-progress.json'));
    if (!progress.runId || progress.runId === run.runId) run.liveProgress = progress;
  } catch { /* progress exists only while a request is active */ }
  return run;
}

async function readCandidate(runId, modelId) {
  const run = await readRun(runId);
  const target = (run.options?.targets ?? []).find(candidate => candidate.model === modelId) ?? manifest.candidates.find(candidate => candidate.model === modelId);
  const report = (run.models ?? []).find(model => (model.model ?? 'offline') === modelId);
  if (!target && !report) throw Object.assign(new Error('Candidate not found'), { statusCode:404 });
  const knownTests = new Map(manifest.tests.map(test => [test.test,test]));
  for (const result of report?.qualificationResults ?? []) knownTests.set(result.test,{ test:result.test,level:result.level });
  const resultMap = new Map((report?.qualificationResults ?? []).map(result => [result.test,result]));
  const qualificationResults = await Promise.all([...knownTests.values()].sort((left,right)=>levelRank(left.level)-levelRank(right.level)||left.test.localeCompare(right.test,undefined,{numeric:true})).map(async test => {
    const result = resultMap.get(test.test);
    if (!result) return { ...test, result:'not_tested', notes:'', discrepancies:[], performance:null };
    return { ...result, evidencePayload:await readEvidence(runId,result) };
  }));
  return {
    run:{ runId:run.runId, status:run.status, generatedAt:run.generatedAt, updatedAt:run.updatedAt },
    candidate:{ name:target?.name ?? report?.model ?? modelId, model:modelId, status:report?.status ?? 'not_tested', activeTest:report?.activeTest ?? null, warmup:report?.warmup ?? null, qualificationResults, liveProgress:run.liveProgress?.model===modelId ? run.liveProgress : null }
  };
}

async function readEvidence(runId, result) {
  const directory = result.evidence?.directory;
  const resultFile = result.evidence?.resultFile;
  if (!directory || !resultFile) return null;
  validateSegment(directory, 'candidate evidence directory');
  validateSegment(resultFile, 'result artifact');
  try {
    const candidateDirectory = resolve(resultsRoot, runId, directory);
    const saved = await readJson(resolve(candidateDirectory, resultFile));
    const rawName = saved.inference?.artifacts?.rawBackendResponse;
    let rawOutputStream = null;
    if (rawName) {
      validateSegment(rawName, 'raw inference artifact');
      rawOutputStream = await readFile(resolve(candidateDirectory, rawName), 'utf8');
    }
    return {
      visibleResponse:saved.visibleResponse ?? saved.inference?.response?.visible ?? null,
      reasoningResponse:saved.reasoningResponse ?? saved.inference?.response?.reasoning ?? null,
      rawOutputStream,
      extractedTestPrompt:saved.inference?.extractedTestPrompt ?? null,
      finishReason:saved.inference?.response?.finishReason ?? null
    };
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function currentSnapshot() {
  const runs = await listRuns();
  return { type:'snapshot', runs, run:runs.length ? await readRun(runs[0].runId) : null, manifest };
}
async function sendCurrent(socket) { sendWebSocket(socket, await currentSnapshot()); }
async function broadcastCurrent() {
  if (!clients.size || shuttingDown) return;
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

function scheduleIdleShutdown() {
  if (clients.size || idleTimer || shuttingDown) return;
  idleTimer=setTimeout(() => beginShutdown('no live browser connection'),config.idleShutdownMs);
  idleTimer.unref();
}
function cancelIdleShutdown() { if (idleTimer) clearTimeout(idleTimer); idleTimer=null; }
function beginShutdown(reason) {
  if (shuttingDown) return;
  shuttingDown=true;
  cancelIdleShutdown();
  clearInterval(broadcastTimer);
  console.log(`Dashboard shutting down gracefully: ${reason}`);
  for (const socket of clients) {
    try { sendWebSocket(socket,{ type:'server_shutdown', reason }); socket.end(); }
    catch { socket.destroy(); }
  }
  clients.clear();
  server.close(() => { process.exitCode=0; });
  setTimeout(() => { server.closeAllConnections?.(); },250).unref();
}

function levelOf(file) { return file.match(/level-([0-9]+a?)/i)?.[1]?.toUpperCase() ?? file; }
function levelRank(level) { const order=['1','2','3','4','4A','5','6','7','8']; const index=order.indexOf(String(level)); return index<0 ? order.length : index; }
function validateSegment(value,label) { if (!value || basename(value)!==value) throw new Error(`Invalid ${label}`); }
async function readJson(file) { return JSON.parse(await readFile(file,'utf8')); }
async function sendAsset(response,name,contentType) { response.writeHead(200,{ 'content-type':contentType,'cache-control':'no-store' }); response.end(await readFile(resolve(dashboardRoot,name))); }
function sendJson(response,status,value) { response.writeHead(status,{ 'content-type':'application/json; charset=utf-8','cache-control':'no-store' }); response.end(JSON.stringify(value)); }
