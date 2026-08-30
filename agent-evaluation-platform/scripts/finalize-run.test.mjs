import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const finalizer = fileURLToPath(new URL('./finalize-run.mjs', import.meta.url));

test('aggregates duplicate subtests and pass-with-note into the highest level', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'agent-test-summary-'));
  try {
    const input = join(directory, 'run.json');
    const output = join(directory, 'summary.md');
    await writeFile(input, JSON.stringify({ runId:'test', generatedAt:'now', models:[{ model:'candidate', qualificationResults:[
      row('1','pass'), row('1','pass'), row('2','pass'), row('2','pass_with_discrepancy')
    ] }] }));
    const result = spawnSync(process.execPath, [finalizer, input, '--output', output], { encoding:'utf8' });
    assert.equal(result.status, 0);
    const markdown = await readFile(output, 'utf8');
    assert.match(markdown, /candidate \| Level 2 ✅/);
    assert.match(markdown, /Qualified through L2/);
  } finally { await rm(directory, { recursive:true, force:true }); }
});

test('reports the highest selected level when lower levels were not run', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'agent-test-summary-'));
  try {
    const input = join(directory, 'run.json');
    const output = join(directory, 'summary.md');
    await writeFile(input, JSON.stringify({ runId:'test', generatedAt:'now', models:[{ model:'candidate', qualificationResults:[row('2','pass'), row('2','pass')] }] }));
    const result = spawnSync(process.execPath, [finalizer, input, '--output', output], { encoding:'utf8' });
    assert.equal(result.status, 0);
    const markdown = await readFile(output, 'utf8');
    assert.match(markdown, /candidate \| Level 2 ✅/);
    assert.match(markdown, /Passed selected levels: L2/);
  } finally { await rm(directory, { recursive:true, force:true }); }
});

test('ranks by highest level, lowest average TTFT, then highest average output tokens', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'agent-test-summary-'));
  try {
    const input = join(directory, 'run.json');
    const output = join(directory, 'summary.md');
    const models = [
      candidate('level-one', [performanceRow('1', 100, 900)]),
      candidate('slow-level-two', [performanceRow('2', 100, 2000)]),
      candidate('fast-low-output', [performanceRow('2', 200, 1000)]),
      candidate('fast-high-output', [performanceRow('2', 500, 1000)])
    ];
    await writeFile(input, JSON.stringify({ runId:'test', generatedAt:'now', models }));
    const result = spawnSync(process.execPath, [finalizer, input, '--output', output], { encoding:'utf8' });
    assert.equal(result.status, 0);
    const markdown = await readFile(output, 'utf8');
    assert.ok(markdown.indexOf('| fast-high-output |') < markdown.indexOf('| fast-low-output |'));
    assert.ok(markdown.indexOf('| fast-low-output |') < markdown.indexOf('| slow-level-two |'));
    assert.ok(markdown.indexOf('| slow-level-two |') < markdown.indexOf('| level-one |'));
  } finally { await rm(directory, { recursive:true, force:true }); }
});

test('excludes captured warmup metrics from averages', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'agent-test-summary-'));
  try {
    const input = join(directory, 'run.json');
    const output = join(directory, 'summary.md');
    const model = candidate('candidate', [performanceRow('1', 200, 1000)]);
    model.qualificationResults[0].performance.promptTokens = 100;
    model.qualificationResults[0].performance.totalTokens = 300;
    model.warmup = { kind:'warmup', includedInEvaluation:false, includedInAverages:false, performance:{ promptTokens:9999, outputTokens:9999, totalTokens:19998, timeToFirstTokenMs:99999 } };
    await writeFile(input, JSON.stringify({ runId:'test', generatedAt:'now', models:[model] }));
    const result = spawnSync(process.execPath, [finalizer, input, '--output', output], { encoding:'utf8' });
    assert.equal(result.status, 0);
    const markdown = await readFile(output, 'utf8');
    assert.match(markdown, /\| candidate \| Level 1 ✅ \| 100 \| 200 \| 300 \| — \| 1\.00s \|/);
    assert.doesNotMatch(markdown, /9,999|99\.999/);
  } finally { await rm(directory, { recursive:true, force:true }); }
});

function row(level, result) {
  return { test:`level-${level}`, level, result, notes:'', discrepancies:[], performance:null };
}

function performanceRow(level, outputTokens, timeToFirstVisibleTokenMs) {
  return { ...row(level, 'pass'), performance:{ outputTokens, timeToFirstVisibleTokenMs } };
}

function candidate(model, qualificationResults) {
  return { model, qualificationResults };
}
