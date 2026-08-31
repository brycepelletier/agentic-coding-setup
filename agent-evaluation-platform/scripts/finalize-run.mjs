#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { showHelp, validateArguments, wantsHelp } from './cli-arguments.mjs';
import { renderWeightedReport } from './weighted-scoring.mjs';

const [, , input, ...args] = process.argv;
const cliArgs = process.argv.slice(2);
const HELP = `
Usage: test.mjs summary RUN.json [--output REPORT.md] [--weighted]

Create the ranked cross-model qualification summary.

Options:
  --output FILE    Write Markdown to FILE instead of standard output.
  --weighted       Append weighted reporting when RUN.json contains it.
  -h, --help       Show this help.
`;
if (wantsHelp(cliArgs)) showHelp(HELP);
try { validateArguments(cliArgs, { valueOptions:['--output'], flags:['--weighted'], maxPositionals:1 }); }
catch (error) { showHelp(HELP, error.message); }
const outputIndex = args.findIndex(arg => arg === '--output' || arg.startsWith('--output='));
const output = outputIndex < 0 ? undefined : (args[outputIndex].includes('=') ? args[outputIndex].slice(9) : args[outputIndex + 1]);
if (!input) {
  showHelp(HELP, 'Provide run.json');
}

const report = JSON.parse(await readFile(input, 'utf8'));
const lines = [
  '# Agentic Coding Qualification Summary',
  '',
  `Run ${report.runId ?? 'unknown'} · ${report.generatedAt ?? ''}`,
  '',
  '## Qualification Summary',
  '',
  '| Candidate | Highest Test Passed | Avg Prompt Tokens | Avg Output Tokens | Avg Total Tokens | Avg tok/s | Avg Visible TTFT | Status / Failure |',
  '|---|---|---:|---:|---:|---:|---:|---|'
];
for (const model of [...(report.models ?? [])].sort(compareModels)) lines.push(summaryRow(model));
lines.push('');
if (args.includes('--weighted') && report.weighted) {
  lines.push('', renderWeightedReport(report.weighted).replace(/^# /, '## ').trim(), '');
}
const markdown = lines.join('\n');
if (output) await writeFile(output, markdown); else process.stdout.write(markdown);

function summaryRow(model) {
  const results = model.qualificationResults ?? [];
  const completed = results.filter(result => !['skipped','invalid_environment'].includes(result.result));
  const invalid = results.filter(result => result.result === 'invalid_environment');
  const grouped = new Map();
  for (const result of completed) {
    const current = grouped.get(result.level) ?? [];
    current.push(result);
    grouped.set(result.level, current);
  }
  const levelOrder = ['1','2','3','4','4A','5','6','7','8'];
  const passedLevels = levelOrder.filter(level => {
    const rows = grouped.get(level);
    return rows?.length && rows.every(row => ['pass','pass_with_discrepancy'].includes(row.result));
  });
  const highest = passedLevels.at(-1) ?? null;
  const contiguous = highest && levelOrder.slice(0, levelOrder.indexOf(highest)+1).every(level => passedLevels.includes(level));
  const firstFailure = completed.find(result => result.result === 'fail');
  const candidate = model.model ?? 'Offline response';
  const highestLabel = highest ? `Level ${highest} ✅` : 'None ❌';
  const warmupFailure = model.status === 'warmup_failed' ? `Warmup failed: ${model.warmup?.error ?? 'model did not become ready'}` : null;
  const status = warmupFailure ?? (firstFailure ? failureText(firstFailure) : (invalid.length ? `Invalid environment: ${invalid.map(result=>`L${result.level}`).join(', ')} not comparable` : (highest ? (contiguous ? `Qualified through L${highest}` : `Passed selected levels: ${passedLevels.map(level => `L${level}`).join(', ')}`) : 'No completed qualification level')));
  const performance = completed.map(result => result.performance).filter(Boolean);
  return `| ${candidate} | ${highestLabel} | ${average(performance, 'promptTokens')} | ${average(performance, 'outputTokens')} | ${average(performance, 'totalTokens')} | ${average(performance, 'tokensPerSecond', 2)} | ${averageTtft(completed)} | ${status} |`;
}

function compareModels(left, right) {
  const leftRank = rankingValues(left);
  const rightRank = rankingValues(right);
  return rightRank.highestLevel - leftRank.highestLevel
    || leftRank.averageTtft - rightRank.averageTtft
    || rightRank.averageOutputTokens - leftRank.averageOutputTokens
    || String(left.model ?? '').localeCompare(String(right.model ?? ''));
}

function rankingValues(model) {
  const completed = (model.qualificationResults ?? []).filter(result => !['skipped','invalid_environment'].includes(result.result));
  const grouped = new Map();
  for (const result of completed) {
    const current = grouped.get(result.level) ?? [];
    current.push(result);
    grouped.set(result.level, current);
  }
  const levelOrder = ['1','2','3','4','4A','5','6','7','8'];
  const passedLevels = levelOrder.filter(level => {
    const rows = grouped.get(level);
    return rows?.length && rows.every(row => ['pass','pass_with_discrepancy'].includes(row.result));
  });
  const ttft = numericValues(completed.map(result => result.performance?.timeToFirstVisibleTokenMs ?? result.performance?.timeToFirstTokenMs));
  const outputTokens = numericValues(completed.map(result => result.performance?.outputTokens));
  return {
    highestLevel: passedLevels.length ? levelOrder.indexOf(passedLevels.at(-1)) : -1,
    averageTtft: ttft.length ? mean(ttft) : Number.POSITIVE_INFINITY,
    averageOutputTokens: outputTokens.length ? mean(outputTokens) : Number.NEGATIVE_INFINITY
  };
}

function average(rows, field, decimals = 0) {
  const values = numericValues(rows.map(row => row[field]));
  if (!values.length) return '—';
  const value = mean(values);
  return decimals ? value.toFixed(decimals) : Math.round(value).toLocaleString('en-US');
}
function averageTtft(results) {
  const values = numericValues(results.map(result => result.performance?.timeToFirstVisibleTokenMs ?? result.performance?.timeToFirstTokenMs));
  return values.length ? `${(mean(values) / 1000).toFixed(2)}s` : '—';
}
function numericValues(values) {
  return values.filter(value => value !== null && value !== undefined && value !== '').map(Number).filter(Number.isFinite);
}
function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
function failureText(result) {
  const discrepancy = result.discrepancies?.[0];
  if (discrepancy?.question) return `L${result.level}: Q${discrepancy.question} expected ${discrepancy.expected}, observed ${discrepancy.observed}`;
  return `L${result.level}: ${result.notes || 'qualification failure'}`;
}
