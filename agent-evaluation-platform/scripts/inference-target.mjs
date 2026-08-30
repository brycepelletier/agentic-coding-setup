import { readFile } from 'node:fs/promises';

export async function loadTargetFile(file) {
  const parsed = JSON.parse(await readFile(file, 'utf8'));
  return Array.isArray(parsed) ? parsed : (parsed.targets ?? [parsed]);
}

export function createTarget(input = {}) {
  const model = input.model;
  const protocol = input.protocol ?? 'openai-chat';
  const baseUrl = input.baseUrl ?? input.url ?? null;
  const endpoint = input.endpoint ?? null;
  if (!model) throw new Error('Inference target requires a model identifier');
  if (!baseUrl && !endpoint) throw new Error(`Inference target ${model} requires baseUrl or endpoint`);
  if (baseUrl && endpoint) throw new Error(`Inference target ${model} must use either baseUrl or endpoint`);
  if (endpoint && input.path) throw new Error(`Inference target ${model} cannot combine endpoint with a path override`);
  return {
    name: input.name ?? model,
    model,
    protocol,
    baseUrl,
    endpoint,
    path: input.path ?? null,
    authentication: normalizeAuthentication(input.authentication),
    requestParameters: { ...(input.requestParameters ?? {}) }
  };
}

export function authenticationHeaders(authentication, environment = process.env) {
  if (!authentication) return {};
  if (authentication.type !== 'bearer') throw new Error(`Unsupported authentication type: ${authentication.type}`);
  const token = authentication.token ?? (authentication.env ? environment[authentication.env] : undefined);
  if (!token) throw new Error(`Missing bearer token${authentication.env ? ` in ${authentication.env}` : ''}`);
  return { authorization:`Bearer ${token}` };
}

export function publicTarget(target) {
  return {
    name: target.name,
    model: target.model,
    protocol: target.protocol,
    baseUrl: target.baseUrl,
    endpoint: target.endpoint,
    path: target.path,
    authentication: target.authentication ? { type:target.authentication.type, env:target.authentication.env ?? null, configured:true } : null,
    requestParameters: target.requestParameters
  };
}

export function parseRequestParameters(value) {
  if (!value) return {};
  const parsed = JSON.parse(value);
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error('--request-params must be a JSON object');
  return parsed;
}

function normalizeAuthentication(authentication) {
  if (!authentication) return null;
  if (typeof authentication === 'string') return { type:'bearer', env:authentication };
  return { type:authentication.type ?? 'bearer', ...(authentication.env ? { env:authentication.env } : {}), ...(authentication.token ? { token:authentication.token } : {}) };
}
