# Stage 8 — Create the Agents

## Goal

Combine already-tested components into three roles without broadening any role.

## Install

Follow [Agent Creation](../agent-creation.md) and [Local Agent Orchestration](../agent-orchestration.md). Install the reviewed definitions under `%USERPROFILE%\.agents` with `scripts/sync-agents.ps1 -Mode Install`, then verify them with `-Mode Check`.

Software Engineer receives delegation, `agent-env/*`, two web-research tools, and todo—no Git/GitHub, Docker, or host shell. GitHub Operator is not user-invocable and receives only Git/GitHub tools. Docker Operator is not user-invocable and receives only `docker-app/*`.

## Verify behavior

1. Software Engineer gates on Linux before work.
2. Direct branch discovery fails.
3. It delegates branch/status.
4. GitHub Operator independently runs status; remote tasks add `auth_check`.
5. GitHub Operator refuses source editing.
6. All roles preserve unrelated work.
7. `RUNNER_REQUIRED` flows GO -> SE -> DO and READY flows DO -> SE -> GO.
8. GO proves GitHub runner/workflow state; DO proves only Docker runner state.

Judge visible tool calls, not the polish of the final narrative.

## Stop/go

Continue only when role boundaries and delegation are observable. Complete
[Docker MCP Stage 7A](07a-docker-app.md) before enabling Docker Operator.

Next: [Project](09-project.md).
