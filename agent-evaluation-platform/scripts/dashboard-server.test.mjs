import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { connect } from 'node:net';

const serverFile = fileURLToPath(new URL('./dashboard-server.mjs', import.meta.url));

test('serves the dashboard and live run snapshots', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'agent-dashboard-'));
  const runDirectory = join(directory, 'live-run');
  await mkdir(runDirectory);
  await writeFile(join(runDirectory, 'run.json'), JSON.stringify(run('running')));
  await writeFile(join(runDirectory, 'live-progress.json'), JSON.stringify({ runId:'live-run', model:'candidate', stage:'streaming', visibleCharacters:42 }));
  const child = spawn(process.execPath, [serverFile, '--results', directory, '--host', '127.0.0.1', '--port', '0'], { stdio:['ignore','pipe','pipe'] });
  try {
    const port = await listeningPort(child);
    const base = `http://127.0.0.1:${port}`;
    const health = await fetch(`${base}/api/health`).then(response => response.json());
    assert.equal(health.status, 'ok');
    const html = await fetch(base).then(response => response.text());
    assert.match(html, /Agent Evaluation Platform/);
    assert.match(html, /Live qualification telemetry/);
    assert.match(html, /new WebSocket/);
    const socketMessage = await websocketSnapshot(port);
    assert.equal(socketMessage.type, 'snapshot');
    assert.equal(socketMessage.run.runId, 'live-run');
    assert.equal(socketMessage.run.liveProgress.visibleCharacters, 42);
    const first = await fetch(`${base}/api/runs/live-run`).then(response => response.json());
    assert.equal(first.status, 'running');
    await writeFile(join(runDirectory, 'run.json'), JSON.stringify(run('completed')));
    const updated = await fetch(`${base}/api/runs/live-run`).then(response => response.json());
    assert.equal(updated.status, 'completed');
  } finally {
    child.kill();
    await new Promise(resolve => child.once('exit', resolve));
    await rm(directory, { recursive:true, force:true });
  }
});

function listeningPort(child) {
  return new Promise((resolve, reject) => {
    let output = '';
    const timeout = setTimeout(() => reject(new Error(`Dashboard did not start: ${output}`)), 5000);
    child.stdout.setEncoding('utf8').on('data', chunk => {
      output += chunk;
      const match = output.match(/Dashboard listening at http:\/\/127\.0\.0\.1:(\d+)/);
      if (match) { clearTimeout(timeout); resolve(Number(match[1])); }
    });
    child.stderr.setEncoding('utf8').on('data', chunk => output += chunk);
    child.once('exit', code => { clearTimeout(timeout); reject(new Error(`Dashboard exited ${code}: ${output}`)); });
  });
}

function run(status) {
  return { runId:'live-run', generatedAt:new Date().toISOString(), status, models:[{ model:'candidate', status:'running', qualificationResults:[] }] };
}

function websocketSnapshot(port) {
  return new Promise((resolve, reject) => {
    const socket = connect(port, '127.0.0.1');
    let buffer = Buffer.alloc(0);
    let upgraded = false;
    const timeout = setTimeout(() => { socket.destroy(); reject(new Error('Timed out waiting for WebSocket snapshot')); }, 5000);
    socket.on('connect', () => {
      const key = randomBytes(16).toString('base64');
      socket.write(`GET /live HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`);
    });
    socket.on('data', chunk => {
      buffer = Buffer.concat([buffer, chunk]);
      if (!upgraded) {
        const boundary = buffer.indexOf('\r\n\r\n');
        if (boundary < 0) return;
        assert.match(buffer.subarray(0, boundary).toString(), /101 Switching Protocols/);
        buffer = buffer.subarray(boundary + 4);
        upgraded = true;
      }
      const payload = decodeFrame(buffer);
      if (!payload) return;
      clearTimeout(timeout);
      socket.destroy();
      resolve(JSON.parse(payload));
    });
    socket.on('error', error => { clearTimeout(timeout); reject(error); });
  });
}

function decodeFrame(buffer) {
  if (buffer.length < 2) return null;
  let length = buffer[1] & 0x7f;
  let offset = 2;
  if (length === 126) { if (buffer.length < 4) return null; length=buffer.readUInt16BE(2); offset=4; }
  else if (length === 127) { if (buffer.length < 10) return null; length=Number(buffer.readBigUInt64BE(2)); offset=10; }
  if (buffer.length < offset + length) return null;
  return buffer.subarray(offset, offset + length).toString('utf8');
}
