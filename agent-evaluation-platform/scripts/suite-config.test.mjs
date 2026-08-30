import test from 'node:test';
import assert from 'node:assert/strict';
import { extractSystemPrompt, loadSuiteConfig } from './suite-config.mjs';

test('uses the versioned suite system prompt explicitly', async () => {
  const suite = await loadSuiteConfig();
  const system = extractSystemPrompt('<!-- AGENT-TEST:PROMPT:BEGIN -->test<!-- AGENT-TEST:PROMPT:END -->', suite);
  assert.equal(system.source, 'suite');
  assert.equal(system.version, '1.0.0');
  assert.match(system.content, /qualification test/);
});

test('a test system block overrides suite defaults', async () => {
  const suite = await loadSuiteConfig();
  const source = '<!-- AGENT-TEST:SYSTEM:BEGIN -->\nTest-specific system instruction.\n<!-- AGENT-TEST:SYSTEM:END -->';
  const system = extractSystemPrompt(source, suite);
  assert.equal(system.source, 'test');
  assert.equal(system.content, 'Test-specific system instruction.');
});

test('tests can run without a system prompt', async () => {
  const suite = await loadSuiteConfig();
  assert.equal(extractSystemPrompt('test', suite, { disabled:true }), null);
});
