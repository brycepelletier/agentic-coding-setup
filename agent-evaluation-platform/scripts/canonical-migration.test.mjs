import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalId, loadAllTestDefinitions, loadTestDefinition } from './test-definitions.mjs';
import { expandLevels } from './level-selector.mjs';
import { scoreRun } from './weighted-scoring.mjs';

test('canonical JSON is independently sufficient for the complete L1-L13 suite', async () => {
  const definitions = await loadAllTestDefinitions();
  assert.deepEqual(definitions.map(item => item.id), Array.from({length:13}, (_, index) => `L${index + 1}`));
  for (const definition of definitions) {
    assert.ok(definition.prompt && definition.legacy && definition.mode);
    assert.ok(definition.outputContract && definition.evaluation);
    for (const question of definition.questions ?? []) assert.ok(question.expected && question.accepted && question.severity && question.competencies);
  }
  const l12 = await loadTestDefinition('L12');
  const l13 = await loadTestDefinition('L13');
  assert.deepEqual(l12.execution.prerequisites, ['L11']);
  assert.deepEqual(l13.execution.prerequisites, ['L12']);
  assert.equal(l12.execution.requiredEvidence[0], 'task/telemetry-normalizer/ISSUE.md');
  assert.equal(l13.execution.hiddenAcceptance, 'normalizeMetrics(null)');
});

test('legacy aliases remain readable without becoming canonical identities', () => {
  assert.equal(canonicalId('level-4a-self-audit.md'), 'L9');
  assert.equal(canonicalId('level-8-controlled-implementation.md'), 'L13');
  assert.equal(canonicalId('L10.json'), 'L10');
});

test('canonical CLI selectors accept IDs, lists, ranges, and reject invalid ranges', () => {
  assert.deepEqual([...expandLevels('L1')], ['L1']);
  assert.deepEqual([...expandLevels('L1,L3,L5')], ['L1','L3','L5']);
  assert.deepEqual([...expandLevels('L1-L6')], ['L1','L2','L3','L4','L5','L6']);
  assert.deepEqual([...expandLevels('L10-L13')], ['L10','L11','L12','L13']);
  assert.throws(() => expandLevels('L6-L1'), /reversed/);
  assert.throws(() => expandLevels('L0'), /Unknown/);
  assert.throws(() => expandLevels('L14'), /Unknown/);
});

test('L5 Q6 structured competency and risk metadata drives multi-competency scoring', async () => {
  const question = (await loadTestDefinition('L5')).questions.find(item => item.id === 'Q6');
  assert.deepEqual(question.competencies, ['state_delegation','authority_scope']);
  assert.deepEqual(question.risk, { authorityViolation:true, critical:true });
  const config = { scoringVersion:'test', competencies:[{id:'state_delegation',label:'State',weight:50},{id:'authority_scope',label:'Authority',weight:50}], findingCredit:{defaultHard:0,defaultNote:1,classifications:{}}, selfAudit:{recoveryCredit:.5,failureCredit:0}, manualReview:{unresolvedCredit:null,defaultReviewedCredit:1}, criticalFindings:[], scoreCeilings:[{counter:'criticalViolationCount',threshold:1,maximum:89}], tests:[{test:'L5',groups:[{competency:'state_delegation',questions:'1-10'},{competency:'authority_scope',questions:'1-10'}]}] };
  const result = scoreRun({runId:'synthetic',models:[{model:'candidate',qualificationResults:[{testId:'L5',test:'L5',level:'L5',result:'fail',discrepancies:[{question:6,severity:'hard',classification:'ANSWER MISMATCH',risk:question.risk}]}]}]},config).candidates[0];
  assert.equal(result.risks.authorityViolationCount, 1);
  assert.equal(result.risks.criticalViolationCount, 1);
  assert.equal(result.appliedCeilings[0].maximum, 89);
});
