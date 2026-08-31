import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export async function ensureDashboard({ resultsRoot, host, port, timeoutMs = 2500 }) {
  const healthUrl = `http://${host}:${port}/api/health`;
  const existing = await health(healthUrl);
  if (existing && resolve(existing.resultsRoot) === resolve(resultsRoot)) return { status:'reused', healthUrl };
  if (existing) return { status:'unavailable', healthUrl, reason:`Port ${port} is serving a different results directory` };
  const child = spawn(process.execPath, [
    fileURLToPath(new URL('./dashboard-server.mjs', import.meta.url)),
    '--results', resultsRoot,
    '--host', host,
    '--port', String(port)
  ], { detached:true, stdio:'ignore', windowsHide:true });
  child.unref();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await delay(100);
    if (await health(healthUrl)) return { status:'started', healthUrl, pid:child.pid };
  }
  return { status:'unavailable', healthUrl, pid:child.pid };
}

async function health(url) {
  try {
    const response = await fetch(url, { signal:AbortSignal.timeout(300) });
    if (!response.ok) return null;
    const body = await response.json();
    return body.status === 'ok' ? body : null;
  } catch { return null; }
}
function delay(milliseconds) { return new Promise(resolve => setTimeout(resolve, milliseconds)); }
