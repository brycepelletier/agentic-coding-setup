import os from 'node:os';
import { execFile } from 'node:child_process';

export function startHostMetricsSampler({ intervalMs = 200, gpuCommand = process.platform === 'win32' ? 'nvidia-smi.exe' : 'nvidia-smi' } = {}) {
  let previousCpu = cpuSnapshot();
  let stopped = false;
  let sampling = false;
  const samples = [];
  const sample = async () => {
    if (stopped || sampling) return;
    sampling = true;
    try {
      const currentCpu = cpuSnapshot();
      const cpu = cpuUtilization(previousCpu, currentCpu);
      previousCpu = currentCpu;
      samples.push({ at:new Date().toISOString(), cpu, gpu:await sampleGpu(gpuCommand) });
    } finally { sampling = false; }
  };
  const timer = setInterval(sample, intervalMs);
  return {
    async stop() {
      stopped = true;
      clearInterval(timer);
      while (sampling) await new Promise(resolve => setTimeout(resolve, 5));
      const currentCpu = cpuSnapshot();
      samples.push({ at:new Date().toISOString(), cpu:cpuUtilization(previousCpu, currentCpu), gpu:await sampleGpu(gpuCommand) });
      return summarize(samples);
    }
  };
}

function cpuSnapshot() {
  return os.cpus().map(cpu => ({ ...cpu.times }));
}

function cpuUtilization(previous, current) {
  const cores = current.map((times, index) => {
    const prior = previous[index] ?? times;
    const total = Object.values(times).reduce((sum, value) => sum + value, 0) - Object.values(prior).reduce((sum, value) => sum + value, 0);
    const idle = times.idle - prior.idle;
    return total > 0 ? Math.max(0, Math.min(100, (1 - idle / total) * 100)) : 0;
  });
  return { overallPercent:cores.length ? cores.reduce((sum, value) => sum + value, 0) / cores.length : null, highestCorePercent:cores.length ? Math.max(...cores) : null };
}

function sampleGpu(command) {
  return new Promise(resolve => execFile(command, ['--query-gpu=utilization.gpu,memory.used', '--format=csv,noheader,nounits'], { timeout:1500 }, (error, stdout) => {
    if (error) return resolve(null);
    const rows = stdout.trim().split(/\r?\n/).map(line => line.split(/\s*,\s*/).map(Number)).filter(values => values.length >= 2 && values.every(Number.isFinite));
    resolve(rows.length ? { utilizationPercent:Math.max(...rows.map(row => row[0])), memoryUsedMb:Math.max(...rows.map(row => row[1])) } : null);
  }));
}

function summarize(samples) {
  const cpu = samples.map(sample => sample.cpu).filter(Boolean);
  const gpu = samples.map(sample => sample.gpu).filter(Boolean);
  return {
    peakSystemCpuPercent:cpu.length ? Math.max(...cpu.map(sample => sample.overallPercent)) : null,
    peakSingleCoreCpuPercent:cpu.length ? Math.max(...cpu.map(sample => sample.highestCorePercent)) : null,
    peakGpuPercent:gpu.length ? Math.max(...gpu.map(sample => sample.utilizationPercent)) : null,
    peakVramMb:gpu.length ? Math.max(...gpu.map(sample => sample.memoryUsedMb)) : null,
    sampleCount:samples.length,
    samples
  };
}
