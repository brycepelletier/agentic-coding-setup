import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const entry = fileURLToPath(new URL('../test.mjs', import.meta.url));
const commands = ['run','single','evaluate','summary','report','score','audit-results','audit-execution','dashboard','metrics'];

test('the main entry point provides command help', () => {
  const result = spawnSync(process.execPath, [entry, '--help'], { encoding:'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Usage: test\.mjs COMMAND/);
  for (const command of commands) assert.match(result.stdout, new RegExp(`\\b${command}\\b`));
});

for (const command of commands) {
  test(`test.mjs ${command} provides contextual help`, () => {
    const result = spawnSync(process.execPath, [entry, command, '--help'], { encoding:'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Usage:/);
    assert.match(result.stdout, /--help/);
  });
}

test('invalid batch usage returns an error and complete help', () => {
  const result = spawnSync(process.execPath, [entry, 'run', '--unknown'], { encoding:'utf8' });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Unknown option: --unknown/);
  assert.match(result.stderr, /--warmup-prompt/);
  assert.match(result.stderr, /--clear/);
});

test('missing required input returns help', () => {
  const result = spawnSync(process.execPath, [entry, 'single'], { encoding:'utf8' });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /canonical test ID/);
  assert.match(result.stderr, /Usage:/);
});

test('unknown context returns main help', () => {
  const result = spawnSync(process.execPath, [entry, 'unknown-context'], { encoding:'utf8' });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Unknown command: unknown-context/);
  assert.match(result.stderr, /Usage: test\.mjs COMMAND/);
});
