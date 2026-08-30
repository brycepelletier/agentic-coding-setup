#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { showHelp, validateArguments, wantsHelp } from './cli-arguments.mjs';
import { loadPersistedReviews, loadScoringConfig, renderWeightedReport, scoreRun } from './weighted-scoring.mjs';

const args = process.argv.slice(2);
const HELP = `
Usage: test.mjs score RUN_DIRECTORY [--scoring FILE] [--output FILE]

Recalculate weighted scoring from persisted evaluation evidence without model inference.

Options:
  --scoring FILE   Scoring configuration; default config/scoring.json.
  --output FILE    Markdown output; default RUN_DIRECTORY/weighted-summary.md.
  --json FILE      JSON output; default RUN_DIRECTORY/weighted-results.json.
  -h, --help       Show this help.
`;
if (wantsHelp(args)) showHelp(HELP);
try { validateArguments(args, { valueOptions:['--scoring','--output','--json'], maxPositionals:1 }); }
catch (error) { showHelp(HELP, error.message); }
const input = args[0];
if (!input || input.startsWith('-')) showHelp(HELP, 'Provide a run directory or run.json');
const get = name => { const index=args.findIndex(value=>value===name || value.startsWith(`${name}=`)); return index<0 ? undefined : (args[index].includes('=') ? args[index].slice(name.length+1) : args[index+1]); };
const inputPath = resolve(input);
const runFile = inputPath.toLowerCase().endsWith('.json') ? inputPath : resolve(inputPath, 'run.json');
const runDirectory = dirname(runFile);
const report = JSON.parse(await readFile(runFile, 'utf8'));
const scoringPath = get('--scoring') ? resolve(get('--scoring')) : fileURLToPath(new URL('../config/scoring.json', import.meta.url));
const config = await loadScoringConfig(scoringPath);
const reviews = await loadPersistedReviews(runDirectory, report);
const weighted = scoreRun(report, config, reviews);
weighted.scoringConfiguration = scoringPath;
const markdown = renderWeightedReport(weighted, config);
const markdownPath = resolve(get('--output') ?? resolve(runDirectory, 'weighted-summary.md'));
const jsonPath = resolve(get('--json') ?? resolve(runDirectory, 'weighted-results.json'));
await mkdir(dirname(markdownPath), { recursive:true });
await mkdir(dirname(jsonPath), { recursive:true });
await writeFile(markdownPath, markdown);
await writeFile(jsonPath, JSON.stringify(weighted, null, 2));
console.log(`Weighted score: run ${weighted.originalRunId} · scoring ${weighted.scoringProfile} ${weighted.scoringVersion} · ${weighted.complete ? 'complete' : 'incomplete'} · unresolved reviews ${weighted.unresolvedReviewCount}`);
console.log(`Markdown: ${markdownPath}`);
console.log(`JSON: ${jsonPath}`);
