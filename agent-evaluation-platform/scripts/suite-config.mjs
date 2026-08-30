import { readFile } from 'node:fs/promises';

const suiteFile = new URL('../config/qualification-suite.json', import.meta.url);

export async function loadSuiteConfig() {
  return JSON.parse(await readFile(suiteFile, 'utf8'));
}

export function extractSystemPrompt(testSource, suite, { disabled = false } = {}) {
  if (disabled) return null;
  const testPrompt = testSource.match(/<!--\s*AGENT-TEST:SYSTEM:BEGIN\s*-->([\s\S]*?)<!--\s*AGENT-TEST:SYSTEM:END\s*-->/i)?.[1]?.trim();
  if (testPrompt) return { source:'test', id:'test-system-prompt', version:suite.suiteVersion, content:testPrompt };
  return suite.defaultSystemPrompt ? { source:'suite', ...suite.defaultSystemPrompt } : null;
}
