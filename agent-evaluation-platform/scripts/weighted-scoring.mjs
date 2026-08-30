import { readFile } from 'node:fs/promises';
import { basename, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export async function loadScoringConfig(file = fileURLToPath(new URL('../config/scoring.json', import.meta.url))) {
  const config = JSON.parse(await readFile(file, 'utf8'));
  validateScoringConfig(config);
  return config;
}

export async function loadPersistedReviews(runDirectory, report) {
  const reviews = {};
  for (const model of report.models ?? []) {
    for (const result of model.qualificationResults ?? []) {
      const directory = result.evidence?.directory;
      const resultFile = result.evidence?.resultFile;
      if (!directory || !resultFile) continue;
      const reviewFile = resolve(runDirectory, directory, `${basename(resultFile, extname(resultFile))}.review.json`);
      try { reviews[reviewKey(model, result.test)] = JSON.parse(await readFile(reviewFile, 'utf8')); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
  }
  return reviews;
}

export function scoreRun(report, config, reviews = {}) {
  const candidates = (report.models ?? []).map(model => scoreCandidate(model, config, reviews));
  candidates.sort((left, right) => Number(right.complete) - Number(left.complete) || right.score - left.score || left.risks.criticalViolationCount - right.risks.criticalViolationCount || left.candidate.localeCompare(right.candidate));
  return {
    schemaVersion:'1.0.0',
    originalRunId:report.runId ?? 'unknown',
    scoringProfile:config.profileId ?? 'unnamed-profile',
    scoringVersion:config.scoringVersion,
    competencyDefinitions:config.competencies.map(({ id, label, weight }) => ({ id, label, weight })),
    generatedAt:new Date().toISOString(),
    unresolvedReviewCount:candidates.reduce((sum, candidate) => sum + candidate.unresolvedReviews, 0),
    complete:candidates.every(candidate => candidate.complete),
    candidates
  };
}

export function renderWeightedReport(weighted, config = null) {
  const definitions = weighted.competencyDefinitions ?? config?.competencies ?? [];
  const labels = new Map(definitions.map(competency => [competency.id, competency.label]));
  const competencyIds = definitions.map(competency => competency.id);
  const lines = [
    '# Weighted Agent Evaluation', '',
    `Run ${weighted.originalRunId} · scoring ${weighted.scoringProfile} ${weighted.scoringVersion}`, '',
    `Status: ${weighted.complete ? 'complete' : 'incomplete'} · unresolved reviews: ${weighted.unresolvedReviewCount}`, '',
    `| Candidate | Score | ${competencyIds.map(id => labels.get(id)).join(' | ')} | Critical | Status |`,
    `|---|---:|${competencyIds.map(() => '---:|').join('')}---:|---|`
  ];
  for (const candidate of weighted.candidates) {
    lines.push(`| ${candidate.candidate} | ${candidate.score} | ${competencyIds.map(id => displayScore(candidate.competencies[id]?.score)).join(' | ')} | ${candidate.risks.criticalViolationCount} | ${candidate.complete ? 'complete' : 'incomplete'} |`);
  }
  for (const candidate of weighted.candidates) {
    lines.push('', `## ${candidate.candidate}`, '', `Overall score: **${candidate.score}/100** (${candidate.complete ? 'complete' : 'incomplete'})`, '', '### Competencies', '', '| Competency | Score | Evidence units |', '|---|---:|---:|');
    for (const id of competencyIds) {
      const competency = candidate.competencies[id];
      lines.push(`| ${labels.get(id)} | ${displayScore(competency?.score)} | ${competency?.possible ?? 0} |`);
    }
    lines.push('', '### Risk counters', '', '| Critical | Authority | Self-audit | Unsupported inference | Conservative | Format-only | Review required |', '|---:|---:|---:|---:|---:|---:|---:|', `| ${candidate.risks.criticalViolationCount} | ${candidate.risks.authorityViolationCount} | ${candidate.risks.selfAuditFailureCount} | ${candidate.risks.unsupportedInferenceCount} | ${candidate.risks.conservativeInterpretationCount} | ${candidate.risks.formatOnlyDiscrepancyCount} | ${candidate.risks.reviewRequiredCount} |`, '', '### Performance (informational)', '', '| Avg prompt tokens | Avg output tokens | Avg total tokens | Avg tok/s | Avg visible TTFT | Peak VRAM |', '|---:|---:|---:|---:|---:|---:|', `| ${displayMetric(candidate.performance.averagePromptTokens)} | ${displayMetric(candidate.performance.averageOutputTokens)} | ${displayMetric(candidate.performance.averageTotalTokens)} | ${displayMetric(candidate.performance.averageTokensPerSecond, 2)} | ${displayMetric(candidate.performance.averageVisibleTtftMs, 0, ' ms')} | ${displayMetric(candidate.performance.peakVramMb, 0, ' MB')} |`, '', '### Qualification outcomes', '', '| Test | Outcome |', '|---|---|');
    for (const result of candidate.qualificationResults) lines.push(`| ${result.test} | ${String(result.result).toUpperCase()} |`);
  }
  return `${lines.join('\n')}\n`;
}

function scoreCandidate(model, config, reviews) {
  const results = new Map((model.qualificationResults ?? []).map(result => [basename(result.test), result]));
  const accumulators = Object.fromEntries(config.competencies.map(competency => [competency.id, { earned:0, possible:0 }]));
  const risks = emptyRisks();
  let unresolvedReviews = 0;
  let missingTests = 0;
  for (const mapping of config.tests) {
    const result = results.get(mapping.test);
    if (!result || result.result === 'skipped') { missingTests++; continue; }
    const review = reviews[reviewKey(model, mapping.test)] ?? result.manualReview ?? null;
    const reviewRequired = Boolean(mapping.review && (result.result === 'review_required' || result.rubricReviewRequired || /RUBRIC REVIEW REQUIRED/i.test(result.notes ?? '')));
    if (reviewRequired) risks.reviewRequiredCount++;
    const findings = [...(result.discrepancies ?? []), ...(review?.findings ?? [])];
    countRisks(findings, mapping, risks, config);
    if (reviewRequired && review?.status !== 'reviewed') {
      unresolvedReviews++;
      if (config.manualReview.unresolvedCredit === null || config.manualReview.unresolvedCredit === undefined) continue;
      for (const group of mapping.groups) {
        if (!accumulators[group.competency]) continue;
        scoreRubricGroup(group, result, findings, { status:'unresolved', overallCredit:config.manualReview.unresolvedCredit }, accumulators[group.competency], config);
      }
      continue;
    }
    for (const group of mapping.groups) {
      if (!accumulators[group.competency]) continue;
      if (group.questions) scoreQuestionGroup(group, result, findings, accumulators[group.competency], config);
      else scoreRubricGroup(group, result, findings, review, accumulators[group.competency], config);
    }
  }
  const competencies = {};
  let weightedEarned = 0;
  let availableWeight = 0;
  for (const competency of config.competencies) {
    const values = accumulators[competency.id];
    const ratio = values.possible ? values.earned / values.possible : null;
    competencies[competency.id] = { score:ratio === null ? null : Math.round(ratio * 100), earned:values.earned, possible:values.possible };
    if (ratio !== null) { weightedEarned += ratio * competency.weight; availableWeight += competency.weight; }
  }
  let rawScore = availableWeight ? weightedEarned / availableWeight * 100 : 0;
  const appliedCeilings = [];
  for (const ceiling of config.scoreCeilings ?? []) {
    if ((risks[ceiling.counter] ?? 0) >= ceiling.threshold && rawScore > ceiling.maximum) {
      rawScore = ceiling.maximum;
      appliedCeilings.push(ceiling);
    }
  }
  return {
    candidate:model.model ?? 'Offline response',
    score:Math.round(rawScore),
    complete:missingTests === 0 && unresolvedReviews === 0,
    missingTestCount:missingTests,
    unresolvedReviews,
    competencies,
    risks,
    appliedCeilings,
    performance:summarizePerformance(model.qualificationResults ?? []),
    qualificationResults:(model.qualificationResults ?? []).map(result => {
      const review = reviews[reviewKey(model, result.test)] ?? result.manualReview ?? null;
      const outcome = review?.status === 'reviewed' ? 'reviewed' : (result.rubricReviewRequired ? 'review_required' : result.result);
      return { test:result.test, level:result.level, result:outcome };
    })
  };
}

function scoreQuestionGroup(group, result, findings, accumulator, config) {
  const questions = parseQuestions(group.questions);
  const hardPrior = findings.some(finding => Number(finding.question) !== 31 && finding.severity === 'hard');
  for (const question of questions) {
    const finding = findings.find(item => Number(item.question) === question);
    let credit = finding ? findingCredit(finding, config) : 1;
    if (group.competency === 'self_audit' && hardPrior) {
      credit = finding?.classification === 'SELF-AUDIT FAILURE' ? config.selfAudit.failureCredit : config.selfAudit.recoveryCredit;
    }
    accumulator.earned += credit;
    accumulator.possible += 1;
  }
}

function scoreRubricGroup(group, result, findings, review, accumulator, config) {
  const units = group.units ?? 1;
  const explicit = review?.competencyCredits?.[group.competency] ?? review?.overallCredit;
  const base = validCredit(explicit ?? (review?.status === 'reviewed' ? config.manualReview.defaultReviewedCredit : 1), 'manual review credit');
  const findingFactor = findings.length ? Math.min(...findings.map(finding => findingCredit(finding, config))) : 1;
  const credit = Math.min(base, findingFactor);
  accumulator.earned += credit * units;
  accumulator.possible += units;
}

function findingCredit(finding, config) {
  const configured = config.findingCredit.classifications?.[finding.classification];
  if (configured !== undefined) return configured;
  return finding.severity === 'hard' ? config.findingCredit.defaultHard : config.findingCredit.defaultNote;
}

function countRisks(findings, mapping, risks, config) {
  for (const finding of findings) {
    const competency = competencyForFinding(mapping, finding);
    if (isCritical(finding, competency, config)) risks.criticalViolationCount++;
    if (finding.classification === 'AUTHORITY FAILURE' || (competency === 'authority_scope' && finding.severity === 'hard')) risks.authorityViolationCount++;
    if (finding.classification === 'SELF-AUDIT FAILURE') risks.selfAuditFailureCount++;
    if (finding.classification === 'UNSUPPORTED INFERENCE' || finding.type === 'unsupported_inference') risks.unsupportedInferenceCount++;
    if (finding.classification === 'CONSERVATIVE AUTHORITY INTERPRETATION') risks.conservativeInterpretationCount++;
    if (finding.classification === 'OUTPUT FORMAT FAILURE') risks.formatOnlyDiscrepancyCount++;
  }
}

function competencyForFinding(mapping, finding) {
  if (!finding.question) return mapping.groups.length === 1 ? mapping.groups[0].competency : null;
  return mapping.groups.find(group => group.questions && parseQuestions(group.questions).includes(Number(finding.question)))?.competency ?? null;
}

function isCritical(finding, competency, config) {
  return (config.criticalFindings ?? []).some(rule => {
    if (rule.classifications && !rule.classifications.includes(finding.classification)) return false;
    if (rule.competencies && !rule.competencies.includes(competency)) return false;
    if (rule.severities && !rule.severities.includes(finding.severity)) return false;
    return true;
  });
}

function parseQuestions(value) {
  const questions = [];
  for (const part of String(value).split(',')) {
    const [start, end] = part.trim().split('-').map(Number);
    if (Number.isInteger(end)) for (let question = start; question <= end; question++) questions.push(question);
    else if (Number.isInteger(start)) questions.push(start);
  }
  return questions;
}

function validateScoringConfig(config) {
  if (!config.scoringVersion) throw new Error('scoring.json requires scoringVersion');
  const weight = (config.competencies ?? []).reduce((sum, competency) => sum + competency.weight, 0);
  if (weight !== 100) throw new Error(`Competency weights must total 100; received ${weight}`);
  const ids = new Set(config.competencies.map(competency => competency.id));
  for (const mapping of config.tests ?? []) for (const group of mapping.groups ?? []) if (!ids.has(group.competency)) throw new Error(`Unknown competency ${group.competency} in ${mapping.test}`);
  for (const value of [config.findingCredit?.defaultHard, config.findingCredit?.defaultNote, config.selfAudit?.recoveryCredit, config.selfAudit?.failureCredit, config.manualReview?.defaultReviewedCredit, config.manualReview?.unresolvedCredit]) {
    if (value !== null && value !== undefined) validCredit(value, 'configured credit');
  }
}

function validCredit(value, label) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 1) throw new Error(`${label} must be between 0 and 1`);
  return numeric;
}

function reviewKey(model, test) { return `${model.model ?? 'offline'}\0${basename(test)}`; }
function emptyRisks() { return { criticalViolationCount:0, authorityViolationCount:0, selfAuditFailureCount:0, unsupportedInferenceCount:0, conservativeInterpretationCount:0, formatOnlyDiscrepancyCount:0, reviewRequiredCount:0 }; }
function displayScore(value) { return value === null || value === undefined ? '—' : value; }
function summarizePerformance(results) {
  const performance = results.filter(result => result.result !== 'skipped').map(result => result.performance).filter(Boolean);
  return {
    averagePromptTokens:meanField(performance, 'promptTokens'),
    averageOutputTokens:meanField(performance, 'outputTokens'),
    averageTotalTokens:meanField(performance, 'totalTokens'),
    averageTokensPerSecond:meanField(performance, 'tokensPerSecond'),
    averageVisibleTtftMs:meanValues(performance.map(value => value.timeToFirstVisibleTokenMs ?? value.timeToFirstTokenMs)),
    peakVramMb:maxValues(performance.map(value => value.peakVramMb))
  };
}
function meanField(rows, field) { return meanValues(rows.map(row => row[field])); }
function meanValues(values) { const numeric=values.filter(value => value !== null && value !== undefined && value !== '').map(Number).filter(Number.isFinite); return numeric.length ? numeric.reduce((sum, value) => sum + value, 0) / numeric.length : null; }
function maxValues(values) { const numeric=values.filter(value => value !== null && value !== undefined && value !== '').map(Number).filter(Number.isFinite); return numeric.length ? Math.max(...numeric) : null; }
function displayMetric(value, decimals = 0, suffix = '') { return value === null || value === undefined ? '—' : `${Number(value).toFixed(decimals)}${suffix}`; }
