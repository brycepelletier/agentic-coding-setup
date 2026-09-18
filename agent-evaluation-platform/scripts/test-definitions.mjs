import { readFile, readdir } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const definitionDirectory = resolve(root, 'test');
const ids = Array.from({length:13}, (_, index) => `L${index + 1}`);
const legacyAliases = new Map([
  ['level-1-basic-authority-consistency.md','L1'], ['level-1-basic-authority.md','L2'],
  ['level-2-auth-role-boundry.md','L3'], ['level-2-role-boundaries.md','L4'],
  ['level-3-multiconstrain-state-and-authority.md','L5'], ['level-3-state-authority.md','L6'],
  ['level-4-long-context.md','L7'], ['level-4-long-form-constraint-retention.md','L8'],
  ['level-4a-self-audit.md','L9'], ['level-5-repository-discovery.md','L10'],
  ['level-6-architecture-reconstruction.md','L11'], ['level-7-planning-only.md','L12'],
  ['level-8-controlled-implementation.md','L13']
]);

export function canonicalIds() { return [...ids]; }
export function canonicalId(value) {
  const text = basename(String(value)).replace(/\.json$/i, '');
  if (/^L(?:[1-9]|1[0-3])$/i.test(text)) return text.toUpperCase();
  return legacyAliases.get(text.toLowerCase()) ?? legacyAliases.get(`${text.toLowerCase()}.md`) ?? null;
}
export function legacyFilename(id) { return [...legacyAliases.entries()].find(([, value]) => value === id)?.[0] ?? null; }
export function legacyPath(id) { const filename = legacyFilename(id); return filename ? resolve(definitionDirectory, 'legacy', filename) : null; }
export function definitionPath(id) { const canonical = canonicalId(id); if (!canonical) return null; return resolve(definitionDirectory, `${canonical}.json`); }
export async function loadTestDefinition(value) {
  const path = definitionPath(value);
  if (!path) throw new Error(`Unknown qualification test: ${value}`);
  return JSON.parse(await readFile(path, 'utf8'));
}
export async function loadAllTestDefinitions() {
  const definitions = await Promise.all(ids.map(loadTestDefinition));
  validateSuiteDefinitions(definitions);
  return definitions;
}
export function validateSuiteDefinitions(definitions) {
  if (definitions.length !== 13) throw new Error(`Expected 13 test definitions, found ${definitions.length}`);
  const seen = new Set();
  const competencies = new Set(['authority_scope','state_delegation','constraint_retention','architecture_synthesis','self_audit','repository_understanding','planning','controlled_implementation']);
  for (let index = 0; index < definitions.length; index++) {
    const definition = definitions[index];
    if (definition.id !== ids[index]) throw new Error(`Invalid suite order at index ${index}: expected ${ids[index]}`);
    if (seen.has(definition.id)) throw new Error(`Duplicate test ID: ${definition.id}`); seen.add(definition.id);
    if (definition.order !== index + 1) throw new Error(`Invalid order for ${definition.id}`);
    if (definition.execution?.prerequisites?.some(item => !ids.includes(item))) throw new Error(`Invalid prerequisite in ${definition.id}`);
    const questions = definition.questions ?? []; const questionIds = new Set();
    for (const question of questions) {
      if (questionIds.has(question.id)) throw new Error(`Duplicate question ID ${definition.id}/${question.id}`); questionIds.add(question.id);
      if (!question.expected || !Array.isArray(question.accepted)) throw new Error(`Malformed deterministic question ${definition.id}/${question.id}`);
      if (!question.competencies.length || question.competencies.some(item => !competencies.has(item))) throw new Error(`Unknown competency in ${definition.id}/${question.id}`);
      if (question.risk && (typeof question.risk.authorityViolation !== 'boolean' || typeof question.risk.critical !== 'boolean')) throw new Error(`Invalid risk metadata in ${definition.id}/${question.id}`);
    }
    const sections = definition.evaluation?.requiredSections ?? []; const sectionIds = new Set();
    for (const section of sections) { if (sectionIds.has(section.id)) throw new Error(`Duplicate required-section identifier ${definition.id}/${section.id}`); sectionIds.add(section.id); }
  }
  return true;
}
export async function resolveTestInput(value) {
  const id = canonicalId(value);
  // Temporary/custom Markdown fixtures remain supported for compatibility;
  // canonical suite tests must resolve through L1-L13 JSON definitions.
  if (!id) return { id:null, definition:{}, legacy:null, path:null };
  const definition = await loadTestDefinition(id);
  return { id, definition, legacy: legacyFilename(id), path: definitionPath(id) };
}
