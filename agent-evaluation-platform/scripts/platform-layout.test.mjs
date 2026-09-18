import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadTargetFile } from './inference-target.mjs';

const testDirectory = fileURLToPath(new URL('../test/', import.meta.url));
const targetExample = fileURLToPath(new URL('../config/targets/targets.example.json', import.meta.url));

test('discovers all qualification tests from the test directory', async () => {
  const files = (await readdir(testDirectory)).filter(file => /^L(?:[1-9]|1[0-3])\.json$/i.test(file));
  assert.equal(files.length, 13);
  assert.ok(files.includes('L1.json'));
  assert.ok(files.includes('L13.json'));
});

test('loads target definitions from the config targets directory', async () => {
  const targets = await loadTargetFile(targetExample);
  assert.ok(targets.length > 0);
  assert.ok(targets.every(target => target.model));
});
