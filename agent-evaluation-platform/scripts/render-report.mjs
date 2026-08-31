#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { showHelp, validateArguments, wantsHelp } from './cli-arguments.mjs';
import { renderWeightedReport } from './weighted-scoring.mjs';

const [, , input, output] = process.argv;
const args = process.argv.slice(2);
const HELP = `
Usage: test.mjs report RUN.json [REPORT.md]

Render detailed per-model qualification and performance tables.

Arguments:
  RUN.json      Aggregate run JSON.
  REPORT.md     Optional output file; otherwise writes to standard output.

Options:
  -h, --help    Show this help.
`;
if (wantsHelp(args)) showHelp(HELP);
try { validateArguments(args, { maxPositionals:2 }); }
catch (error) { showHelp(HELP, error.message); }
if (!input) {
  showHelp(HELP, 'Provide run.json');
}

const report = JSON.parse(await readFile(input, 'utf8'));
const lines = [`# Agentic Coding Qualification Report`, '', `Generated: ${report.generatedAt}`, ''];
for (const model of report.models ?? []) {
  lines.push(`## Model: ${model.model ?? 'offline response'}`, '', '### Qualification Results', '', '| Test | Result | Notes |', '|---|---|---|');
  for (const result of model.qualificationResults ?? []) lines.push(`| ${result.level} | ${result.result.toUpperCase()} | ${result.notes ?? (result.result==='invalid_environment'?'Not comparable: required execution environment unavailable':'')} |`);
  lines.push('', '### Performance', '', '| Level | Prompt Tokens | Output Tokens | Total Tokens | tok/s | First Visible | First Generated | Total Time | Peak VRAM | Peak System CPU | Peak Core CPU | Peak GPU |', '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const result of (model.qualificationResults ?? []).filter(result=>result.result!=='invalid_environment')) {
    const p = result.performance ?? {};
    lines.push(`| L${result.level} | ${p.promptTokens ?? ''} | ${p.outputTokens ?? ''} | ${p.totalTokens ?? ''} | ${p.tokensPerSecond?.toFixed?.(2) ?? ''} | ${p.timeToFirstVisibleTokenMs ?? p.timeToFirstTokenMs ?? ''} | ${p.timeToFirstGeneratedTokenMs ?? ''} | ${p.totalTimeMs ?? ''} | ${p.peakVramMb ?? ''} | ${p.peakSystemCpuPercent ?? p.peakCpuPercent ?? ''} | ${p.peakSingleCoreCpuPercent ?? ''} | ${p.peakGpuPercent ?? ''} |`);
  }
  lines.push('');
}
if (report.weighted) lines.push('', renderWeightedReport(report.weighted).replace(/^# /, '## ').trim(), '');
const markdown = lines.join('\n');
if (output) await writeFile(output, markdown); else process.stdout.write(markdown);
