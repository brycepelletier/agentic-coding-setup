# Start Here: What Are We Building?

## The short version

We are building a local AI-assisted software team on one Windows computer. LM Studio runs the language model. VS Code is the user interface. Two agents use the same intelligence but receive different jobs and tools:

- **Software Engineer** reads and changes code, then builds and tests it.
- **GitHub Operator** manages Git history, branches, commits, GitHub, and CI.

Small MCP programs expose only the operations each role needs. Docker containers keep project execution away from the Windows host and sensitive credentials.

## Workshop analogy

```text
Software Engineer                         GitHub Operator
works at the code workbench               works at the records desk
uses compilers and tests                  updates Git history and GitHub
cannot enter the records vault            does not redesign the product
has no GitHub key                          gets narrow, short-lived App access
```

Both may use the same Qwen model, but their badges open different doors. Prompts describe their jobs; MCP tools, mounts, networks, and credentials are the doors and locks.

## Why not one all-powerful agent?

An all-powerful agent is easier to configure but harder to trust. A coding mistake could rewrite history; malicious content could target credentials; the model could inspect Windows files; hundreds of tool definitions consume context; and audits become unclear. This system follows **least privilege** instead.

## Normal task flow

```text
1. User asks Software Engineer to fix a bug.
2. It starts/verifies the protected Linux environment.
3. It reads code/tests, edits, builds, and verifies.
4. It delegates Git status/commit/push work to GitHub Operator.
5. GitHub Operator validates the repo and App authorization, then acts.
6. GitHub Actions independently validates the pull request.
7. Agents report only results they observed.
```

## Major pieces

- **LM Studio:** runs local Qwen and exposes an OpenAI-compatible API.
- **VS Code:** chat, model selection, agents, and MCP connections.
- **Agent prompts:** responsibilities and workflows.
- **MCP servers:** structured model-callable tools.
- **Docker:** isolated Linux environments.
- **GitHub App:** selected-repository, short-lived authorization.
- **Environment Controller:** real application, policy, builds, tests, and CI.

Current components are `agent-env-mcp`, `github-app-mcp`, and `web-research-mcp`. Repository-owned `.devcontainer`, the HTTP token broker, and standalone DuckDuckGo agent are superseded.

## Success at the end

- Qwen answers in VS Code.
- Software Engineer edits/builds/tests in Linux.
- It cannot see `.git`, the PEM, or Docker socket.
- GitHub Operator sees real Git and the authorized GitHub repository.
- Credentials never appear in model-visible output.
- CI independently validates the work.

Next: [Concepts and glossary](concepts.md).

