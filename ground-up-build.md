# Ground-Up Build Map

Build in order. Every stage must work independently before the next layer is added.

```text
Host -> Model -> VS Code -> Engineering MCP -> GitHub App
     -> GitHub MCP -> Research MCP -> Agents -> Project -> CI -> audit
```

| Stage | Requires | Produces | Stop/go proof |
|---:|---|---|---|
| 1 | New Windows host | Installed prerequisites | Version/container checks |
| 2 | GPU/storage | Loopback model API | Direct model response |
| 3 | Model API | Local VS Code model | Chat response |
| 4 | Docker/Node | Protected engineering tools | Build works; `.git` hidden |
| 5 | GitHub repo | App IDs and PEM | Auth chain succeeds |
| 6 | App/Docker | Git/GitHub tools | Auth dry run, no mutation |
| 7 | Node/network | Research tools | Policy tests pass |
| 8 | MCPs | Role agents | Delegation/boundary tests |
| 9 | Environment repo | Project policy/integration | Project builds correctly |
| 10 | Runner/Docker | Independent CI/RC | Green workflow/artifacts |
| 11 | Complete stack | Trusted baseline | Full checklist passes |

Why order matters: prompt edits cannot repair a broken MCP; an MCP cannot repair a failed model API; broader Git tools cannot repair a misconfigured GitHub identity. Isolate one variable at a time.

For each stage record UTC time, machine/OS, versions, configuration locations, checks actually run, observed results, deviations, and unresolved risks. Never record secret contents.

1. [Host](build-guides/01-host.md)
2. [LM Studio](build-guides/02-lm-studio.md)
3. [VS Code model](build-guides/03-vscode-model.md)
4. [agent-env](build-guides/04-agent-env.md)
5. [GitHub App](build-guides/05-github-app.md)
6. [github-app MCP](build-guides/06-github-mcp.md)
7. [web-research](build-guides/07-web-research.md)
8. [Agents](build-guides/08-agents.md)
9. [Project](build-guides/09-project.md)
10. [CI/CD](build-guides/10-ci-cd.md)
11. [Complete verification](verification.md)

