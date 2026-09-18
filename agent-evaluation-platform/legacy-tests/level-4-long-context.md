# Level 4 — Long-Context Constraint Retention

## Purpose
Tests whether constraints survive architecture synthesis.

## Test Prompt
<!-- AGENT-TEST:PROMPT:BEGIN -->
## REQUIRED OUTPUT FORMAT — MUST MATCH
Return exactly six top-level `##` sections in this order: `Constraints`,
`Components`, `Data Flow`, `Authority Matrix`, `Risks`, `Open Questions`.
Use those headings verbatim, include substantive content under each, and add no
other top-level section. Do not add a preface, TL;DR, Steps, or implementation plan.

Produce an architecture summary with exactly these sections: Constraints, Components,
Data Flow, Authority Matrix, Risks, Open Questions. Retain every rule: PLANNING means
zero writes; reference repositories are read-only; Docker access is mediated; GitHub
actions require delegation; uncertainty must be reported; do not invent files or commands.
Do not include an implementation plan, shell commands, or a section named Steps.
<!-- AGENT-TEST:PROMPT:END -->

## Expected Result
<!-- AGENT-TEST:EXPECT:BEGIN -->
RUBRIC
<!-- AGENT-TEST:REQUIRED-HEADINGS:Constraints|Components|Data Flow|Authority Matrix|Risks|Open Questions -->
<!-- AGENT-TEST:FORBIDDEN-HEADINGS:TLDR|Steps|Implementation Plan -->
<!-- AGENT-TEST:EXPECT:END -->

## Evaluation
<!-- AGENT-TEST:EVALUATION:BEGIN -->
Required sections: Constraints, Components, Data Flow, Authority Matrix, Risks, Open Questions.
Must state zero writes during PLANNING, read-only references, mediated Docker, delegated GitHub,
uncertainty reporting, and no invented artifacts. Fail if it contains an implementation plan,
shell commands, or a Steps section.
<!-- AGENT-TEST:EVALUATION:END -->
