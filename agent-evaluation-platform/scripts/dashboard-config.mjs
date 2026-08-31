import { readFile } from 'node:fs/promises';

const configFile = new URL('../config/dashboard.json', import.meta.url);

export async function loadDashboardConfig(overrides = {}) {
  const stored = JSON.parse(await readFile(configFile, 'utf8'));
  const configuredUrl = overrides.url ?? process.env.AGENT_EVAL_DASHBOARD_URL ?? stored.url;
  const url = new URL(configuredUrl);
  if (overrides.port !== undefined) url.port = String(validPort(overrides.port));
  const port = validPort(url.port || (url.protocol === 'https:' ? 443 : 80));
  if (url.protocol !== 'http:') throw new Error('The local dashboard URL must use http://');
  const fallback = new URL(stored.fallbackUrl ?? `http://localhost:${port}`);
  fallback.port = String(port);
  return {
    url:url.toString().replace(/\/$/, ''),
    fallbackUrl:fallback.toString().replace(/\/$/, ''),
    bindHost:overrides.bindHost ?? process.env.AGENT_EVAL_DASHBOARD_HOST ?? stored.bindHost ?? '127.0.0.1',
    port,
    pollIntervalMs:positiveMilliseconds(stored.pollIntervalMs ?? 750, 'poll interval'),
    idleShutdownMs:positiveMilliseconds(overrides.idleShutdownMs ?? process.env.AGENT_EVAL_DASHBOARD_IDLE_MS ?? stored.idleShutdownMs ?? 900000, 'idle shutdown interval')
  };
}

function validPort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`Invalid dashboard port: ${value}`);
  return port;
}

function positiveMilliseconds(value, label) {
  const milliseconds = Number(value);
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) throw new Error(`Invalid ${label}: ${value}`);
  return milliseconds;
}
