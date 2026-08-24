# Evidence and Confidence Map

## Live files inspected

- VS Code `chatLanguageModels.json`, `mcp.json`, `settings.json`, and three agent prompts.
- LM Studio server settings, Bionic settings, and per-model default configurations.
- `agent-env-mcp` 0.4.1 source tree, README, image, Compose file, tests, and package metadata.
- `github-app-mcp` 0.3.0 source tree, README, image, Compose file, tests, and package metadata.
- `web-research-mcp` 0.1.0 source tree and package metadata.
- Environment Controller `AGENTS.md`, README, workflow files, CI image/scripts, tests, and versioning files.
- Retired `github-token-broker` location and retained migration source.

## Conversations used

ChatGPT tasks included Local LLM Agent Setup, Local LLM Agent Sandbox, Set Up VS Code Agent, Configure Codex in VSCode, Qwen3 Coder Model, and LLM Agent Setup Process.

Codex tasks included Environment Controller initial setup, roadmap/CI/CD, Wi-Fi/telemetry work, `github-app-mcp` authentication/refactoring, `agent-env-mcp` boundary validation, and `web-research-mcp` implementation/testing.

## Confidence labels

| Topic | Confidence | Reason |
|---|---|---|
| Current MCP versions/config | High | Live VS Code config and package manifests |
| GitHub IDs/key path/toolsets | High | Live MCP config plus current package README |
| LM Studio server/model parameters | High | Live LM Studio configuration |
| Role/tool boundaries | High | Live prompt files plus MCP implementation/docs |
| Container boundary | High | Current Compose/Dockerfiles and recorded adversarial test |
| CI/CD current state | High | Current workflow and repository docs |
| Historical sequence | Medium-high | Multiple conversation/task records and repo state |
| Webhook receiver | Not current | Discussed, but no verified deployed receiver |
| Custom model weight fine-tune | Not current | Proposed only; no trained adapter/model artifact found |
| Production hardware promotion | Planned | Repository explicitly reserves it for future work |

The reusable templates are sanitized documentation copies. Software Engineer and GitHub Operator preserve the current role, gate, tool, security, preservation, and completion contracts while removing workstation-specific prose. The Web Search template is explicitly labeled legacy because its live prompt still references the superseded DuckDuckGo MCP.

## Drift warning

This is a point-in-time reconstruction. Before using exact versions or paths on another machine, compare current package manifests, VS Code configuration, LM Studio model files, GitHub App installation settings, and workflow definitions.
