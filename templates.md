# Reusable Configuration Templates

Replace every angle-bracket placeholder. Do not commit secrets.

## VS Code MCP configuration

```json
{
  "servers": {
    "agent-env": {
      "type": "stdio",
      "command": "npx",
      "args": ["--yes", "@brycepelletier/agent-env-mcp@0.4.1"]
    },
    "github": {
      "type": "stdio",
      "command": "npx",
      "args": ["--yes", "@brycepelletier/github-app-mcp@0.3.0"],
      "env": {
        "GITHUB_APP_ID": "<app-id>",
        "GITHUB_APP_INSTALLATION_ID": "<installation-id>",
        "GITHUB_APP_PRIVATE_KEY_PATH": "<absolute-host-pem-path>"
      }
    },
    "web-research": {
      "type": "stdio",
      "command": "npx",
      "args": ["--yes", "@brycepelletier/web-research-mcp@0.1.0"]
    },
    "docker": {
      "type": "stdio",
      "command": "npx",
      "args": ["--yes", "@brycepelletier/docker-app-mcp@0.1.0"]
    }
  }
}
```

## VS Code local model registry

```json
[
  {
    "name": "Local LM Studio",
    "vendor": "customendpoint",
    "apiKey": "${input:chat.lm.secret.local}",
    "apiType": "chat-completions",
    "models": [
      {
        "id": "qwen3-coder-30b-a3b-instruct@q4_k_s",
        "name": "Qwen3-Coder 30B-A3B Q4_K_S",
        "url": "http://localhost:8080/v1/chat/completions",
        "toolCalling": true,
        "vision": false,
        "maxInputTokens": 32768,
        "maxOutputTokens": 8192
      }
    ]
  }
]
```

## Software Engineer frontmatter

This compact example is useful for understanding the shape. For an installable current definition, use [the complete Software Engineer template](agent-templates/software-engineer.agent.md). The corresponding privileged role is [GitHub Operator](agent-templates/github-operator.agent.md). Creation rationale and acceptance tests are in [Agent Creation](agent-creation.md).

```markdown
---
name: Software Engineer
description: Senior software engineer for production-quality project work.
tools:
  - agent
  - 'agent-env/*'
  - 'web-research/web_search'
  - 'web-research/fetch_page'
  - todo
agents:
  - GitHub Operator
  - Docker Operator
---
```

## Project AGENTS.md core

```markdown
# Project Agent Instructions

## Project Execution Boundary

All project command execution must occur inside the designated Linux agent
environment. If outside it, use `agent-env/ensure_environment` and fail closed.

## Repository Preservation

- Preserve unrelated user changes.
- Do not use destructive Git operations unless explicitly requested.
- Never expose credentials in chat, logs, commits, or terminal output.

## Verification

- Run targeted checks first.
- Use configured CI/CD as authoritative final verification when applicable.
- Do not claim checks passed unless they were executed and observed.

## Response Timestamps

Prefix every user-facing response with current UTC when available:
`YYMMDD HH:MM:SSZ`.
```

## GitHub App MCP direct official-server form

Use this only for diagnosis or if the facade is unavailable; the facade is the current preferred single MCP entry.

```json
{
  "type": "stdio",
  "command": "docker",
  "args": [
    "run", "-i", "--rm",
    "--mount", "type=bind,source=<host-pem>,target=/secrets/github-app.pem,readonly",
    "-e", "GITHUB_APP_ID=<app-id>",
    "-e", "GITHUB_APP_INSTALLATION_ID=<installation-id>",
    "-e", "GITHUB_APP_PRIVATE_KEY_PATH=/secrets/github-app.pem",
    "-e", "GITHUB_TOOLSETS=context,issues,pull_requests,actions,projects",
    "ghcr.io/github/github-mcp-server"
  ]
}
```
