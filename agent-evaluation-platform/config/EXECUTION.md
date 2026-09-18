# Agent execution contracts

Levels 1–4 are model-only qualification tests. They receive the versioned system
prompt, the test prompt, and no repository tools. Levels 5–8 are agent-execution
tests and are valid only when the candidate receives the resources and tools
declared in [`execution-contracts.json`](execution-contracts.json).

## Capability audit

| Level | Required repositories/evidence | Filesystem | Commands and tools | Mutation | Git/GitHub | Current runner support |
|---|---|---|---|---|---|---|
| 5 | Four pinned public fixtures plus deterministic documentation-status manifest | Read-only fixture workspace | List, read, literal search, bounded read-only Git; `git status` for every fixture | Prohibited | Local Git required; GitHub not required | Supported |
| 6 | Frozen verified Level 5 artifact | No repository filesystem | No tools; synthesis from frozen evidence only | Prohibited | Neither Git nor GitHub exposed | Supported from candidate evidence or explicit weighted fallback |
| 7 | Frozen Level 6 artifact plus telemetry-normalizer task | Disposable read-only task workspace | List, read, search, configured test command | Prohibited; whole worktree verified unchanged | Git used only by harness; GitHub not exposed | Supported as a concrete planning-only task |
| 8 | Frozen Level 7 plan plus fresh disposable telemetry-normalizer copy | One authorized source file writable | List, read, search, one-file replacement, configured test command | Only `src/normalize-metrics.mjs` | Git used only by harness; Git/GitHub not exposed | Supported with visible and hidden acceptance checks |

Protocol and execution are separate boundaries. `openai-chat` supplies request
and tool-call semantics; the execution contract decides which workspace and
tools exist. Changing an endpoint path cannot turn a text-only request into an
agent execution.

## Fixture identity and evidence

Level 5 execution workspaces receive detached checkouts of the four commits pinned
in `execution-contracts.json`. The runner prefers local clones supplied through
`--fixture-source-root` or `AGENT_EVAL_FIXTURE_SOURCE_ROOT`, then uses the public
repository URLs. It records fixture URL, commit, clean status, tracked-tree hash,
all model tool calls and results, final worktree verification, and canonical
`fixtures/<repository>/<path>` citations.

The documentation-status manifest explicitly identifies current documents and
states when no obsolete documents exist, so Level 5 never requires an
unsupported current-versus-legacy inference. Level 5 fails substantively when a valid workspace exists but a cited path does
not exist, a fixture has no repository evidence, required worktree checks are
missing, or a fixture changes.

Execution outcomes are distinct:

- `invalid_environment`: required host, fixture, or tool environment could not be established.
- `blocked_by_prerequisite`: the environment is valid, but candidate-produced prior-stage evidence is unavailable or invalid.
- `execution_incomplete`: execution began but ended before a final answer because of a turn limit, timeout, unfinished tool call, or equivalent termination.

All remain visible and unscored. For `--force --weighted`, a verified canonical
reference artifact may replace failed candidate evidence for the next isolated
competency. Results record `evidenceSource` and `dependencyFallback`; fallback
credit never completes the end-to-end candidate chain.

## Historical validity audit

Runs created before this execution boundary may contain Level 5–8 results from
text-only inference. Audit them without deleting responses or raw streams:

```text
node agent-evaluation-platform/test.mjs audit-results agent-evaluation-platform/results
```

Use `--dry-run` first to list affected evidence. The command preserves exact
visible/reasoning responses and raw backend artifacts, stores the superseded
evaluation, changes only the qualification outcome to `invalid_environment`,
and writes `environment-validity.json` in each affected run.

The pre-boundary runs `0ff837568df6` and `9c2af2b096f9` (all issued Levels 5–8)
are known to contain potentially
invalid results because the requests lacked the required controlled workspace
and tool access.
