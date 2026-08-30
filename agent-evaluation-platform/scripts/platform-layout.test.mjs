import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadTargetFile } from './inference-target.mjs';

const testDirectory = fileURLToPath(new URL('../test/', import.meta.url));
const targetExample = fileURLToPath(new URL('../config/targets/targets.example.json', import.meta.url));

test('discovers all qualification tests from the test directory', async () => {
  const files = (await readdir(testDirectory)).filter(file => /^level-.*\.md$/i.test(file));
  assert.equal(files.length, 13);
  assert.ok(files.includes('level-1-basic-authority.md'));
  assert.ok(files.includes('level-8-controlled-implementation.md'));
});

test('loads target definitions from the config targets directory', async () => {
  const targets = await loadTargetFile(targetExample);
  assert.ok(targets.length > 0);
  assert.ok(targets.every(target => target.model));
});
