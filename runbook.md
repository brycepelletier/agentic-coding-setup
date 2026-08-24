# New-Machine Recreation Runbook

This is the condensed operational checklist. If this is your first build, follow the explanatory [Ground-Up Build Map](ground-up-build.md) instead; its component guides explain purpose, prerequisites, and stop/go tests.

## 1. Install host prerequisites

Detailed guide: [Stage 1 — Host](build-guides/01-host.md).

- Windows with current updates and GPU drivers appropriate for LM Studio.
- VS Code, Git Bash, PowerShell 7, Node.js 24 LTS, Docker Desktop with Linux containers, and GitHub CLI.
- VS Code GitHub Copilot/Chat and the local-model/custom-agent features used by your current build.
- LM Studio/Bionic.
- A self-hosted Actions runner only if recreating the Environment Controller CI host.

## 2. Restore repositories

Clone or copy these as peers; drive letters may differ:

```text
environment-controller
agent-env-mcp
github-app-mcp
web-research-mcp
githooks
```

Do not restore the retired token broker as a live service.

## 3. Configure LM Studio

Detailed guide: [Stage 2 — LM Studio](build-guides/02-lm-studio.md).

1. Set downloads to a large storage location.
2. Enable the local server, auto-start, port 8080, interface `127.0.0.1`, JIT loading, succinct logs, and disable sensitive/token logging.
3. Download `Qwen3-Coder-30B-A3B-Instruct-Q4_K_S.gguf` or the exact currently approved equivalent.
4. Configure context 40,960; Q8 K/V cache; reasoning budget 8,192; one parallel session; 10 experts; and GPU offload appropriate to the replacement GPU (the current machine uses ~79.17%).
5. Start the server and verify `/v1/models` or a minimal chat completion locally without exposing the endpoint to the LAN.

## 4. Register the local model in VS Code

Detailed guide: [Stage 3 — VS Code model](build-guides/03-vscode-model.md).

Create `%APPDATA%\Code\User\chatLanguageModels.json` from [the template](templates.md#vs-code-local-model-registry). Configure plan/inline/explore defaults to the Qwen endpoint. Enable tool output and terminal compaction.

## 5. Create or restore the GitHub App

First complete [Stage 4 — Engineering runtime](build-guides/04-agent-env.md). Detailed identity guide: [Stage 5 — GitHub App](build-guides/05-github-app.md).

1. Create a user-owned GitHub App or reuse `bp-agent-github-app`.
2. Grant only required repository access; initially select `environment-controller`.
3. Configure development permissions for Contents, Issues, Pull Requests, Workflows, Actions, Projects, Metadata, and Checks as required by the intended toolsets.
4. Download a private key and store it outside repositories with restricted ACLs.
5. Record App ID, installation ID, and exact PEM path.
6. Treat webhook delivery as optional/planned until a receiver and secure tunnel are implemented.

## 6. Configure MCPs

Install and test the MCPs separately in this order: [agent-env](build-guides/04-agent-env.md), [github-app](build-guides/06-github-mcp.md), then [web-research](build-guides/07-web-research.md). Do not add all three and debug them as one unit.

Create `%APPDATA%\Code\User\mcp.json` from [the template](templates.md#vs-code-mcp-configuration). Use the current pinned package versions. If developing locally, run `npm run link` in each package and temporarily set `command` to its linked binary.

## 7. Install agents and project policy

Detailed guides: [Stage 8 — Agents](build-guides/08-agents.md) and [Stage 9 — Project](build-guides/09-project.md).

Follow [Agent Creation and Architectural Intent](agent-creation.md). Install the current [Software Engineer](agent-templates/software-engineer.agent.md) and [GitHub Operator](agent-templates/github-operator.agent.md) definitions under `%APPDATA%\Code\User\prompts`. Do not install the legacy Web Search agent unless deliberately restoring the superseded architecture and updating its tool names. Verify exact frontmatter tool inventories and run all agent acceptance tests. Restore the project's `AGENTS.md`; update legacy `projectEnvironment` wording to `agent-env` only after confirming the live tool name expected by the client.

## 8. Validate trust boundaries

Run every check in [verification.md](verification.md). Do not proceed to autonomous repository work if `.git`, secrets, Docker socket, or arbitrary host paths are visible in the engineering domain.

## 9. Restore Environment Controller CI

Detailed guide: [Stage 10 — CI/CD](build-guides/10-ci-cd.md).

1. Register the self-hosted runner with labels `self-hosted`, `windows`, `x64`, `environment-controller-ci`.
2. Install/start Docker Desktop.
3. Use the visible runner wrapper; do not install it as a hidden service unless explicitly changing policy.
4. Run the PR workflow manually once.
5. Verify release-package artifacts, immutable build-runner behavior, and post-merge RC flow.

## 10. Acceptance task

Ask Software Engineer to inspect the project, run `pio --version`, build, and execute targeted tests. Then separately ask GitHub Operator for branch/status. The first must succeed without real Git access; the second must succeed through the GitHub MCP.
