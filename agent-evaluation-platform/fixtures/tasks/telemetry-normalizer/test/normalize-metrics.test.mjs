import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMetrics } from '../src/normalize-metrics.mjs';

test('normalizes numeric values and clamps percentages', () => {
  assert.deepEqual(normalizeMetrics({ cpuPercent:'120',gpuPercent:-4,vramMb:'512' }),{cpuPercent:100,gpuPercent:0,vramMb:512});
});

test('uses null for invalid values without mutating input', () => {
  const input={cpuPercent:'bad'};
  assert.deepEqual(normalizeMetrics(input),{cpuPercent:null,gpuPercent:null,vramMb:null});
  assert.deepEqual(input,{cpuPercent:'bad'});
});
