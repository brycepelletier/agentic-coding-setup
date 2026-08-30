#!/usr/bin/env node
import { spawn } from 'node:child_process';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const commands = new Map([
  ['run', './scripts/run-all.mjs'],
  ['single', './scripts/run-test.mjs'],
  ['evaluate', './scripts/evaluate-result.mjs'],
  ['summary', './scripts/finalize-run.mjs'],
  ['report', './scripts/render-report.mjs'],
  ['score', './scripts/score-run.mjs'],
  ['dashboard', './scripts/dashboard-server.mjs'],
  ['metrics', './scripts/collect-metrics.mjs']
]);

const HELP = `
Usage: test.mjs COMMAND [arguments] [options]

Single entry point for the Agent Evaluation Platform.

Commands:
  run         Run a batch against live models or saved responses.
  single      Run or evaluate one test file.
  evaluate    Evaluate a response from standard input.
  summary     Build the ranked cross-model summary.
  report      Render detailed per-model tables.
  score       Recalculate weighted scores from a persisted run.
  dashboard   Serve the live browser dashboard.
  metrics     Collect host, LMS, and GPU telemetry.

Run test.mjs COMMAND --help for command-specific arguments and flags.

Examples:
  node agent-evaluation-platform/test.mjs run --targets agent-evaluation-platform/config/targets/targets.example.json
  node agent-evaluation-platform/test.mjs run --url http://localhost:8080/v1 --models MODEL
  node agent-evaluation-platform/test.mjs single agent-evaluation-platform/test/level-1-basic-authority.md --url http://localhost:8080/v1 --model MODEL
  node agent-evaluation-platform/test.mjs score agent-evaluation-platform/results/RUN_ID
  node agent-evaluation-platform/test.mjs dashboard
  node agent-evaluation-platform/test.mjs metrics metrics.json
`;

const [, , command, ...forwardedArguments] = process.argv;
if (!command || command === '--help' || command === '-h') showHelp();
const target = commands.get(command);
if (!target) showHelp(`Unknown command: ${command}`);

const child = spawn(process.execPath, [fileURLToPath(new URL(target, import.meta.url)), ...forwardedArguments], {
  stdio: 'inherit',
  shell: false,
  env: process.env
});
child.on('error', error => {
  console.error(`Unable to start ${command}: ${error.message}`);
  process.exit(1);
});
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});

function showHelp(error) {
  const stream = error ? process.stderr : process.stdout;
  if (error) stream.write(`Error: ${error}\n\n`);
  stream.write(`${HELP.trim()}\n`);
  process.exit(error ? 2 : 0);
}
