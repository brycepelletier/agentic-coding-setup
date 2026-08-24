# Stage 8 — Create the Agents

## Goal

Combine already-tested components into two roles without broadening either role.

## Install

Follow [Agent Creation](../agent-creation.md). Copy [Software Engineer](../agent-templates/software-engineer.agent.md) and [GitHub Operator](../agent-templates/github-operator.agent.md) to `%APPDATA%\Code\User\prompts`. Do not activate the [legacy Web Search agent](../agent-templates/web-search.legacy.agent.md).

Software Engineer receives delegation, `agent-env/*`, two web-research tools, and todo—no Git/GitHub or host shell. GitHub Operator is not user-invocable and receives only explicit Git/GitHub tools—no editing, research, shell, or agent-env.

## Verify behavior

1. Software Engineer gates on Linux before work.
2. Direct branch discovery fails.
3. It delegates branch/status.
4. GitHub Operator independently runs status; remote tasks add `auth_check`.
5. GitHub Operator refuses source editing.
6. Both preserve unrelated work.

Judge visible tool calls, not the polish of the final narrative.

## Stop/go

Continue only when role boundaries and delegation are observable.

Next: [Project](09-project.md).

