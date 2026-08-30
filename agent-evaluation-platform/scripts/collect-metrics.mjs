#!/usr/bin/env node
import os from 'node:os';
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { startHostMetricsSampler } from './host-metrics.mjs';
import { showHelp, validateArguments, wantsHelp } from './cli-arguments.mjs';

const args = process.argv.slice(2);
const HELP = `
Usage: test.mjs metrics [OUTPUT.json]

Sample optional host/LMS/GPU telemetry until Ctrl+C or termination. Missing GPU
or LMS tools do not prevent collection.

Arguments:
  OUTPUT.json    Destination; default metrics.json.

Options:
  -h, --help     Show this help.

Environment:
  QUALIFICATION_SAMPLE_MS   Sampling interval in milliseconds; default 500.
  LMS_COMMAND               Optional LMS executable path.
  LMS_ARGS                  Space-separated LMS arguments.
  GPU_COMMAND               GPU telemetry command; default nvidia-smi.
`;
if (wantsHelp(args)) showHelp(HELP);
try { validateArguments(args, { maxPositionals:1 }); }
catch (error) { showHelp(HELP, error.message); }
const intervalMs = Number(process.env.QUALIFICATION_SAMPLE_MS ?? 500);
if (!Number.isFinite(intervalMs) || intervalMs <= 0) showHelp(HELP, 'QUALIFICATION_SAMPLE_MS must be a positive number');
const output = process.argv[2] ?? 'metrics.json';
const startedAt = Date.now();
const sampler = startHostMetricsSampler({ intervalMs, gpuCommand:process.env.GPU_COMMAND });
const lmsCommand = process.env.LMS_COMMAND;
const lmsArgs = (process.env.LMS_ARGS ?? '').split(' ').filter(Boolean);
const lmsOutput = [];
let lmsProcess = null;
if (lmsCommand) {
  lmsProcess = spawn(lmsCommand, lmsArgs, { stdio:['ignore','pipe','pipe'], shell:false });
  lmsProcess.stdout.on('data', chunk => lmsOutput.push(chunk.toString()));
  lmsProcess.stderr.on('data', chunk => lmsOutput.push(chunk.toString()));
  lmsProcess.on('error', error => lmsOutput.push(`LMS sampler unavailable: ${error.message}`));
}
let stopping = false;
const stop = async () => {
  if (stopping) return;
  stopping = true;
  if (lmsProcess) lmsProcess.kill();
  const hostMetrics = await sampler.stop();
  const result = {
    schemaVersion:'1.1.0',
    startedAt:new Date(startedAt).toISOString(),
    durationMs:Date.now()-startedAt,
    host:{ platform:process.platform, arch:process.arch, cpus:os.cpus().length, memoryBytes:os.totalmem() },
    peak:{
      systemCpuPercent:hostMetrics.peakSystemCpuPercent,
      singleCoreCpuPercent:hostMetrics.peakSingleCoreCpuPercent,
      gpuUtilizationPercent:hostMetrics.peakGpuPercent,
      vramAllocatedMb:hostMetrics.peakVramMb
    },
    samples:hostMetrics.samples,
    lms:lmsCommand ? { command:lmsCommand, args:lmsArgs, output:lmsOutput.join('') } : null
  };
  await writeFile(output, JSON.stringify(result, null, 2));
  console.log(`Metrics written to ${output}`);
  process.exit(0);
};
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
console.log(`Collecting host metrics every ${intervalMs}ms. Press Ctrl+C to finish.`);
