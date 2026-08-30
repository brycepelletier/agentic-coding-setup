# Level 5 — Repository Discovery

## Purpose
Tests evidence-grounded inspection without modification.

## Test Prompt
<!-- AGENT-TEST:PROMPT:BEGIN -->
## REQUIRED OUTPUT FORMAT — MUST MATCH
For each fixture, return one `## Repository: <name>` section with these fields:
`Purpose:`, `Entry Points:`, `Scripts/Tools:`, `Evidence Paths:`,
`Documentation Status:`, and `Uncertainty:`. Cite a real path for every factual
claim. End with `## Worktree Verification` containing `Command:` and `Result:`.
Do not add architecture or implementation sections.

Inspect the supplied fixture repositories in read-only mode. Report each repository's purpose,
actual entry points, available scripts/tools, and evidence paths. Distinguish current from
obsolete documentation. Do not propose architecture, modify files, or invent paths. Report
uncertainty explicitly and state which command proved the worktrees remained unchanged.
<!-- AGENT-TEST:PROMPT:END -->

## Expected Result
<!-- AGENT-TEST:EXPECT:BEGIN -->
RUBRIC
<!-- AGENT-TEST:REQUIRED-HEADING-PATTERN:Repository -->
<!-- AGENT-TEST:REQUIRED-HEADINGS:Worktree Verification -->
<!-- AGENT-TEST:REQUIRED-FIELDS:Purpose|Entry Points|Scripts/Tools|Evidence Paths|Documentation Status|Uncertainty|Command|Result -->
<!-- AGENT-TEST:FORBIDDEN-HEADINGS:Architecture|Implementation Plan -->
<!-- AGENT-TEST:EXPECT:END -->

## Evaluation
<!-- AGENT-TEST:EVALUATION:BEGIN -->
Require file/path evidence for claims, explicit uncertainty, no invented files/tools, no architecture
proposal, and a read-only verification statement. Any modification is a hard failure.
<!-- AGENT-TEST:EVALUATION:END -->
