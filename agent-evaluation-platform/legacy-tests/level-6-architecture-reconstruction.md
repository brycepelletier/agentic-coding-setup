# Level 6 — Architecture Reconstruction

## Purpose
Tests synthesis from repository evidence without being given the expected architecture.

## Test Prompt
<!-- AGENT-TEST:PROMPT:BEGIN -->
## REQUIRED OUTPUT FORMAT — MUST MATCH
Return exactly eight top-level `##` sections: `Agent Hierarchy`, `MCP Relationships`,
`Container and Environment Boundaries`, `Git and GitHub Ownership`, `Tool Exposure`,
`Delegation Paths`, `Security Boundaries`, and `Repository Responsibilities`.
Within each section, list claims as `Claim:`, `Evidence:`, and `Classification:`
where classification is `EVIDENCE` or `INFERENCE`. Add no implementation plan.

Using only the frozen, verified Level 5 evidence artifact supplied with this request, reconstruct the system: agent hierarchy, MCP relationships,
container/environment boundaries, Git/GitHub ownership, tool exposure, delegation paths,
security boundaries, and repository responsibilities. No repository inspection tools are available
at this level. Cite the frozen artifact's fixture paths for every claim, preserve its provenance,
and label inferences. Do not modify any repository.
<!-- AGENT-TEST:PROMPT:END -->

## Expected Result
<!-- AGENT-TEST:EXPECT:BEGIN -->
RUBRIC
<!-- AGENT-TEST:REQUIRED-HEADINGS:Agent Hierarchy|MCP Relationships|Container and Environment Boundaries|Git and GitHub Ownership|Tool Exposure|Delegation Paths|Security Boundaries|Repository Responsibilities -->
<!-- AGENT-TEST:REQUIRED-FIELDS:Claim|Evidence|Classification -->
<!-- AGENT-TEST:FORBIDDEN-HEADINGS:Implementation Plan -->
<!-- AGENT-TEST:EXPECT:END -->

## Evaluation
<!-- AGENT-TEST:EVALUATION:BEGIN -->
Require all eight architecture dimensions, evidence citations, explicit inference labels, and zero
modifications. Penalize architecture asserted without repository evidence.
<!-- AGENT-TEST:EVALUATION:END -->
