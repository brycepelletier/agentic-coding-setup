# Agent Evaluation Platform

This platform preserves the existing pass/fail Agentic Coding qualification
workflow and optionally derives weighted Software Engineer suitability scores
from the same evaluation evidence. Qualification remains the default; scoring
never changes prompts, inference, fail-fast behavior, or semantic evaluation.

See [CLI and evidence](scripts/README.md) for all commands and flags, and
[weighted scoring](config/SCORING.md) for configuration, competency mapping, risk
counters, manual reviews, and rescoring.
See [agent execution contracts](config/EXECUTION.md) for the Levels 5–8
workspace/tool boundary, pinned fixtures, validity rules, and historical audit.

## Qualification levels

| Level | Capability |
|---|---|
| 1 | Prohibition, negation, temporal authority, consistency |
| 2 | Specialized-agent roles and authority separation |
| 3 | State transitions and capability versus authority |
| 4 | Long-context constraint retention |
| 4A | Self-audit of generated architecture |
| 5 | Repository discovery without modification |
| 6 | Evidence-based architecture reconstruction |
| 7 | Complete planning-only implementation plan |
| 8 | Controlled implementation under explicit authority |

Qualification definitions live in [`test/`](test/). Each Markdown file keeps
its prompt, expected answer, and evaluation metadata together.

## Common commands

Normal fail-fast qualification:

```text
node agent-evaluation-platform/test.mjs run --targets agent-evaluation-platform/config/targets/local-models.json
```

Forced full-suite qualification:

```text
node agent-evaluation-platform/test.mjs run --targets agent-evaluation-platform/config/targets/local-models.json --force
```

Weighted qualification with normal fail-fast execution:

```text
node agent-evaluation-platform/test.mjs run --targets agent-evaluation-platform/config/targets/local-models.json --weighted
```

Full-suite weighted comparison:

```text
node agent-evaluation-platform/test.mjs run --targets agent-evaluation-platform/config/targets/local-models.json --force --weighted
```

Rescore a persisted run without querying a model:

```text
node agent-evaluation-platform/test.mjs score agent-evaluation-platform/results/RUN_ID
```

Each live model receives an isolated warmup before qualification. Existing runs
remain under `results/<run-id>/`; `--clear` removes prior run folders only when
explicitly requested. Performance remains informational and is not included in
the current suitability score.

## Live dashboard

Batch runs automatically start or reuse the dashboard and print this directly
after the run ID:

```text
Qualification run: RUN_ID
Click here to view live updates: http://agent.eval.local:3000
Local fallback: http://localhost:3000
```

The page receives WebSocket updates at `ws://agent.eval.local:3000/live` during
warmup and streamed inference, normally refreshing stream progress every 100
milliseconds. The main page is a compact model-by-test matrix with one row per
candidate and all qualification tests labeled `L1A`–`L4C`, then `L5`–`L8`.
Each cell retains the full colored result text. The top-right toggle switches to
the ranked candidate table. Candidate names link to detail pages containing
per-test performance, discrepancies, the complete live output, and saved
visible/reasoning/raw inference evidence. Live output follows new text while the
viewer remains at the bottom; scrolling upward pauses following until the
viewer returns to the bottom.

Before a run exists, configured candidates and Levels 1–8 are shown with `Not
Tested` badges. The **Shut down** button stops the dashboard gracefully. The
server also stops itself after 15 minutes without a connected dashboard browser;
active qualification processes continue independently and can start a fresh
dashboard when needed.

`agent.eval.local` must resolve to `127.0.0.1`. Add
`127.0.0.1 agent.eval.local` to the machine's hosts file or use the printed
`localhost` fallback. Use `--no-dashboard` to disable automatic startup. The
URL, refresh cadence, and idle shutdown defaults are versioned in
[`config/dashboard.json`](config/dashboard.json).

## Layout

- [`test/`](test/) — versioned Levels 1–8 qualification definitions.
- [`config/`](config/) — suite, scoring, dashboard, report-template, and target configuration.
- [`scripts/`](scripts/) — internal runner, evaluator, reporting, and tests.
- [`fixtures/`](fixtures/) — repository evidence used by Levels 5–8.
- [`results/`](results/) — immutable inference evidence and generated reports.
- [`config/scoring.json`](config/scoring.json) — versioned optional weighted-scoring profile.
- [`config/execution-contracts.json`](config/execution-contracts.json) — versioned Levels 5–8 workspace and tool requirements.
