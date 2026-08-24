# Build the Agentic Coding System from the Ground Up

Reconstruction snapshot: **2026-08-24 UTC**.

This site teaches a junior engineer how to understand and rebuild the local Agentic Coding + Environment Controller system in small, testable pieces. No prior experience with local language models, agents, MCP, or containers is assumed.

## Begin here

1. [Start Here: what we are building](start-here.md)
2. [Concepts and glossary](concepts.md)
3. [Ground-up build map](ground-up-build.md)
4. [New-machine runbook](runbook.md)

Do not begin with the detailed architecture tables. They are reference material for later stages.

## Build one component at a time

| Stage | Component | Result | Guide |
|---:|---|---|---|
| 1 | Host | Windows, VS Code, Docker, Node, Git ready | [Host](build-guides/01-host.md) |
| 2 | LM Studio | Local model API responds | [LM Studio](build-guides/02-lm-studio.md) |
| 3 | VS Code | Local model appears in chat | [Model endpoint](build-guides/03-vscode-model.md) |
| 4 | Engineering runtime | Protected Linux editing/build/test tools | [agent-env](build-guides/04-agent-env.md) |
| 5 | GitHub identity | Restricted GitHub App authenticates | [GitHub App](build-guides/05-github-app.md) |
| 6 | Repository tools | Secure Git and GitHub operations | [github-app MCP](build-guides/06-github-mcp.md) |
| 7 | Research | Bounded public documentation retrieval | [web-research](build-guides/07-web-research.md) |
| 8 | Agents | Two roles with different capabilities | [Agents](build-guides/08-agents.md) |
| 9 | Project | Environment Controller policy and build | [Project](build-guides/09-project.md) |
| 10 | CI/CD | Independent PR and release-candidate checks | [CI/CD](build-guides/10-ci-cd.md) |
| 11 | Audit | Complete security/operation proof | [Verification](verification.md) |

Each guide explains purpose, prerequisites, steps, expected results, and a stop/go checkpoint.

## Reference library

- [Layered architecture](architecture.md)
- [Agent creation and intent](agent-creation.md)
- [LM Studio settings](lm-studio.md)
- [MCP reference](mcp.md)
- [GitHub authentication](github-app.md)
- [Containers](containers.md)
- [CI/CD](ci-cd.md)
- [Templates](templates.md)
- [Troubleshooting](troubleshooting.md)
- [History and superseded experiments](history.md)
- [Evidence](evidence.md)

Labels: **current/verified** is live now; **historical/superseded** was replaced; **planned** is not implemented. Never copy private-key contents into documentation or source control.

