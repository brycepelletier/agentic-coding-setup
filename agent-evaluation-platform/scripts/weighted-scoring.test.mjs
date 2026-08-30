import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scoreRun } from './weighted-scoring.mjs';

const entry = fileURLToPath(new URL('../test.mjs', import.meta.url));

test('rounds only the final displayed score to a whole number', () => {
  const scored = scoreRun(run([result('matrix.md', 'fail', [finding(3)])]), config([{ id:'authority_scope', label:'Authority', weight:100 }], [{ test:'matrix.md', groups:[{ competency:'authority_scope', questions:'1-3' }] }]));
  assert.equal(scored.candidates[0].competencies.authority_scope.earned, 2);
  assert.equal(scored.candidates[0].score, 67);
});

test('competency weighting gives authority substantially more influence', () => {
  const scoring = config([
    { id:'authority_scope', label:'Authority', weight:80 },
    { id:'formatting', label:'Formatting', weight:20 }
  ], [{ test:'matrix.md', groups:[{ competency:'authority_scope', questions:'1' }, { competency:'formatting', questions:'2' }] }]);
  const scored = scoreRun(run([result('matrix.md', 'fail', [{ ...finding(2), classification:'OUTPUT FORMAT FAILURE' }])]), scoring);
  assert.equal(scored.candidates[0].score, 80);
  assert.equal(scored.candidates[0].competencies.authority_scope.score, 100);
  assert.equal(scored.candidates[0].competencies.formatting.score, 0);
});

test('incomplete runs omit unavailable tests instead of assigning zero credit', () => {
  const scoring = config([{ id:'authority_scope', label:'Authority', weight:100 }], [
    { test:'completed.md', groups:[{ competency:'authority_scope', questions:'1' }] },
    { test:'skipped.md', groups:[{ competency:'authority_scope', questions:'1' }] }
  ]);
  const candidate = scoreRun(run([result('completed.md', 'pass'), result('skipped.md', 'skipped')]), scoring).candidates[0];
  assert.equal(candidate.complete, false);
  assert.equal(candidate.score, 100);
  assert.equal(candidate.competencies.authority_scope.possible, 1);
});

test('configured risk ceilings remain visible and cap the overall score', () => {
  const scoring = config([{ id:'authority_scope', label:'Authority', weight:100 }], [{ test:'matrix.md', groups:[{ competency:'authority_scope', questions:'1-10' }] }]);
  scoring.criticalFindings = [{ competencies:['authority_scope'], severities:['hard'] }];
  scoring.scoreCeilings = [{ counter:'criticalViolationCount', threshold:1, maximum:59 }];
  const candidate = scoreRun(run([result('matrix.md', 'fail', [finding(10)])]), scoring).candidates[0];
  assert.equal(candidate.score, 59);
  assert.equal(candidate.appliedCeilings[0].maximum, 59);
});

test('performance is reported but does not contribute to suitability scoring', () => {
  const scoring = config([{ id:'authority_scope', label:'Authority', weight:100 }], [{ test:'matrix.md', groups:[{ competency:'authority_scope', questions:'1' }] }]);
  const fast = result('matrix.md', 'pass');
  fast.performance = { promptTokens:10, outputTokens:20, totalTokens:30, tokensPerSecond:200, timeToFirstVisibleTokenMs:50, peakVramMb:1000 };
  const slow = result('matrix.md', 'pass');
  slow.performance = { promptTokens:100, outputTokens:200, totalTokens:300, tokensPerSecond:2, timeToFirstVisibleTokenMs:5000, peakVramMb:20000 };
  const fastCandidate = scoreRun(run([fast]), scoring).candidates[0];
  const slowCandidate = scoreRun(run([slow]), scoring).candidates[0];
  assert.equal(fastCandidate.score, slowCandidate.score);
  assert.equal(fastCandidate.performance.averageTokensPerSecond, 200);
  assert.equal(slowCandidate.performance.averageTokensPerSecond, 2);
});

test('self-audit recovery receives partial credit and false consistency receives none', () => {
  const scoring = config([
    { id:'authority_scope', label:'Authority', weight:50 },
    { id:'self_audit', label:'Self-Audit', weight:50 }
  ], [{ test:'audit.md', groups:[{ competency:'authority_scope', questions:'1' }, { competency:'self_audit', questions:'31' }] }]);
  const recovered = scoreRun(run([result('audit.md', 'fail', [finding(1)])]), scoring).candidates[0];
  const failed = scoreRun(run([result('audit.md', 'fail', [finding(1), { ...finding(31), classification:'SELF-AUDIT FAILURE' }])]), scoring).candidates[0];
  assert.equal(recovered.competencies.self_audit.score, 50);
  assert.equal(failed.competencies.self_audit.score, 0);
  assert.equal(failed.risks.selfAuditFailureCount, 1);
  assert.ok(recovered.score > failed.score);
});

test('manual rubric review remains unresolved until persisted review credit is supplied', () => {
  const scoring = config([{ id:'architecture_synthesis', label:'Architecture', weight:100 }], [{ test:'rubric.md', review:true, groups:[{ competency:'architecture_synthesis', units:1 }] }]);
  const report = run([{ ...result('rubric.md', 'review_required'), rubricReviewRequired:true, notes:'RUBRIC REVIEW REQUIRED' }]);
  const unresolved = scoreRun(report, scoring).candidates[0];
  const reviewed = scoreRun(report, scoring, { 'candidate\0rubric.md':{ status:'reviewed', overallCredit:0.6, findings:[] } }).candidates[0];
  assert.equal(unresolved.complete, false);
  assert.equal(unresolved.unresolvedReviews, 1);
  assert.equal(unresolved.competencies.architecture_synthesis.score, null);
  assert.equal(unresolved.qualificationResults[0].result, 'review_required');
  assert.equal(reviewed.complete, true);
  assert.equal(reviewed.score, 60);
  assert.equal(reviewed.qualificationResults[0].result, 'reviewed');
});

test('risk counters preserve authority, critical, conservative, format, inference, and review evidence', () => {
  const scoring = config([{ id:'authority_scope', label:'Authority', weight:100 }], [{ test:'risk.md', review:true, groups:[{ competency:'authority_scope', questions:'1-5' }] }]);
  scoring.criticalFindings = [{ competencies:['authority_scope'], severities:['hard'] }];
  const findings = [
    finding(1),
    { ...finding(2), severity:'note', classification:'CONSERVATIVE AUTHORITY INTERPRETATION' },
    { ...finding(3), severity:'note', classification:'UNSUPPORTED INFERENCE' },
    { ...finding(4), classification:'OUTPUT FORMAT FAILURE' },
    { ...finding(5), classification:'SELF-AUDIT FAILURE' }
  ];
  const candidate = scoreRun(run([{ ...result('risk.md', 'review_required', findings), rubricReviewRequired:true }]), scoring).candidates[0];
  assert.deepEqual(candidate.risks, {
    criticalViolationCount:3, authorityViolationCount:3, selfAuditFailureCount:1,
    unsupportedInferenceCount:1, conservativeInterpretationCount:1,
    formatOnlyDiscrepancyCount:1, reviewRequiredCount:1
  });
});

test('rescoring persisted runs uses saved review findings and performs no inference', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'agent-score-run-'));
  try {
    const modelDirectory = join(directory, 'candidate');
    await mkdir(modelDirectory);
    const report = { runId:'persisted-run', models:[{ model:'candidate', qualificationResults:[{ ...result('rubric.md', 'review_required'), rubricReviewRequired:true, evidence:{ directory:'candidate', resultFile:'rubric.json' } }] }] };
    const scoring = config([{ id:'architecture_synthesis', label:'Architecture', weight:100 }], [{ test:'rubric.md', review:true, groups:[{ competency:'architecture_synthesis', units:1 }] }]);
    scoring.scoringVersion = 'rescore-test';
    await writeFile(join(directory, 'run.json'), JSON.stringify(report));
    await writeFile(join(directory, 'scoring.json'), JSON.stringify(scoring));
    await writeFile(join(modelDirectory, 'rubric.review.json'), JSON.stringify({ status:'reviewed', overallCredit:0.8, findings:[] }));
    const processResult = spawnSync(process.execPath, [entry, 'score', directory, '--scoring', join(directory, 'scoring.json')], { encoding:'utf8' });
    assert.equal(processResult.status, 0, processResult.stderr);
    const weighted = JSON.parse(await readFile(join(directory, 'weighted-results.json'), 'utf8'));
    assert.equal(weighted.originalRunId, 'persisted-run');
    assert.equal(weighted.scoringProfile, 'test-profile');
    assert.equal(weighted.scoringVersion, 'rescore-test');
    assert.equal(weighted.unresolvedReviewCount, 0);
    assert.equal(weighted.candidates[0].score, 80);
  } finally { await rm(directory, { recursive:true, force:true }); }
});

function config(competencies, tests) {
  return {
    profileId:'test-profile', scoringVersion:'test', competencies, tests,
    findingCredit:{ defaultHard:0, defaultNote:0.75, classifications:{ 'OUTPUT FORMAT FAILURE':0, 'SELF-AUDIT FAILURE':0 } },
    selfAudit:{ recoveryCredit:0.5, failureCredit:0 },
    manualReview:{ unresolvedCredit:null, defaultReviewedCredit:1 },
    criticalFindings:[], scoreCeilings:[]
  };
}
function run(qualificationResults) { return { runId:'run', models:[{ model:'candidate', qualificationResults }] }; }
function result(testName, outcome, discrepancies = []) { return { test:testName, level:'1', result:outcome, notes:'', discrepancies, performance:null }; }
function finding(question) { return { question, severity:'hard', classification:'ANSWER MISMATCH' }; }
