import test from 'node:test';
import assert from 'node:assert/strict';
import { startHostMetricsSampler } from './host-metrics.mjs';

test('collects CPU peaks and tolerates an unavailable GPU command', async () => {
  const sampler = startHostMetricsSampler({ intervalMs:10, gpuCommand:'definitely-not-a-real-gpu-command' });
  await new Promise(resolve => setTimeout(resolve, 35));
  const metrics = await sampler.stop();
  assert.ok(metrics.sampleCount >= 1);
  assert.ok(Number.isFinite(metrics.peakSystemCpuPercent));
  assert.ok(Number.isFinite(metrics.peakSingleCoreCpuPercent));
  assert.equal(metrics.peakGpuPercent, null);
  assert.equal(metrics.peakVramMb, null);
});
