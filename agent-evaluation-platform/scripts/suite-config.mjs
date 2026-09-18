import { readFile } from 'node:fs/promises';
import { loadAllTestDefinitions, resolveTestInput } from './test-definitions.mjs';

const suiteFile = new URL('../config/qualification-suite.json', import.meta.url);

export async function loadSuiteConfig() {
  const suite = JSON.parse(await readFile(suiteFile, 'utf8'));
  const definitions = await loadAllTestDefinitions();
  if (JSON.stringify(suite.manifest) !== JSON.stringify(definitions.map(item => item.id))) throw new Error('Qualification suite manifest does not match canonical test definitions');
  return { ...suite, definitions };
}

export function extractSystemPrompt(testSource, suite, { disabled = false } = {}) {
  if (disabled) return null;
  const testPrompt = testSource.match(/<!--\s*AGENT-TEST:SYSTEM:BEGIN\s*-->([\s\S]*?)<!--\s*AGENT-TEST:SYSTEM:END\s*-->/i)?.[1]?.trim();
  if (testPrompt) return { source:'test', id:'test-system-prompt', version:suite.suiteVersion, content:testPrompt };
  return suite.defaultSystemPrompt ? { source:'suite', ...suite.defaultSystemPrompt } : null;
}

export async function loadCanonicalTest(value) { return resolveTestInput(value); }
