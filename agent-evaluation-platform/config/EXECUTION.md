# Agent execution contracts

Levels 1–4 are model-only qualification tests. They receive the versioned system
prompt, the test prompt, and no repository tools. Levels 5–8 are agent-execution
tests and are valid only when the candidate receives the resources and tools
declared in [`execution-contracts.json`](execution-contracts.json).

## Capability audit

| Level | Required repositories/evidence | Filesystem | Commands and tools | Mutation | Git/GitHub | Current runner support |
|---|---|---|---|---|---|---|
| 5 | All four pinned public fixtures | Read-only fixture workspace | List, read, literal search, bounded read-only Git; `git status` for every fixture | Prohibited | Local Git required; GitHub not required | Supported by the controlled `openai-chat` tool loop when fixtures and Git are available |
| 6 | Same fixtures plus valid Level 5 execution evidence | Read-only fixture workspace | Same discovery and bounded Git tools | Prohibited | Local Git required; GitHub not required | Supported only after a valid Level 5 agent-execution result |
| 7 | Fixtures, valid Level 6 evidence, and a concrete authorized planning task | Read-only | Discovery tools sufficient for planning; no write tools | Prohibited | Local Git read-only; GitHub not required | Intentionally `invalid_environment` until a concrete task is configured |
| 8 | Reference fixtures, valid Level 7 evidence, a disposable authorized implementation repository, and a concrete change request | Reference fixtures read-only; authorized repository writable | Bounded file edits, tests/builds, and captured verification commands | Permitted only in the authorized implementation repository | Local Git verification required; GitHub prohibited without delegation | Intentionally `invalid_environment` until the task, writable repository, and bounded write/test profile are configured |

Protocol and execution are separate boundaries. `openai-chat` supplies request
and tool-call semantics; the execution contract decides which workspace and
tools exist. Changing an endpoint path cannot turn a text-only request into an
agent execution.

## Fixture identity and evidence

Each execution workspace receives detached checkouts of the four commits pinned
in `execution-contracts.json`. The runner prefers local clones supplied through
`--fixture-source-root` or `AGENT_EVAL_FIXTURE_SOURCE_ROOT`, then uses the public
repository URLs. It records fixture URL, commit, clean status, tracked-tree hash,
all model tool calls and results, final worktree verification, and canonical
`fixtures/<repository>/<path>` citations.

Level 5 fails substantively when a valid workspace exists but a cited path does
not exist, a fixture has no repository evidence, required worktree checks are
missing, or a fixture changes. Missing fixtures, Git, required tools, prior
execution evidence, or an authorized task produces `invalid_environment`.
That outcome is visible but contributes neither weighted credit nor penalty and
keeps weighted evaluation incomplete.

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
