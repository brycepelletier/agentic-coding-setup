# GitHub App and Authentication

For a beginner-friendly explanation and construction sequence, use [Stage 5 — GitHub App](build-guides/05-github-app.md) followed by [Stage 6 — github-app-mcp](build-guides/06-github-mcp.md). This page is the detailed deployment reference.

## Deployment-specific current inventory

```text
GitHub App name: bp-agent-github-app
App ID: 4618233
Installation ID: 154276908
Original selected repository: brycepelletier/environment-controller
Host PEM path: C:\Users\bryce\.ssh\bp-agent-github-app.2026-08-16.private-key.pem
Container PEM path: /secrets/github-app.pem
Official MCP toolsets: context,issues,pull_requests,actions,projects
```

The GitHub installation/settings page is authoritative for current repository access. IDs are safe configuration identifiers, but the PEM contents and installation tokens are secrets.

## App permissions/evolution

The App was configured for the development and CI loop, including read/write access where needed for Contents, Issues, Pull Requests, Workflows, Actions, and Projects, with metadata/check visibility. Event subscriptions discussed included issues, issue comments, PR/review/review-comment/review-thread, push, commit comments, check run/suite, workflow dispatch/job/run, and repository dispatch.

Important: webhook subscriptions were designed but no current local webhook receiver/tunnel was verified. Treat automated webhook wake-up as **planned**, not current.

## Authentication chain

```text
read-only PEM
  -> sign short-lived App JWT
  -> exchange for installation token
  -> restrict token to repository and permissions
  -> perform Git/GitHub operation internally
  -> redact output and discard token
```

The initial PowerShell test proved PEM -> JWT -> installation token -> GitHub repository API. The production MCPs now perform authentication internally; operators should not dot-source a token into a general agent shell.

## Key installation checklist

1. Create/download a GitHub App private key.
2. Move it outside all repositories.
3. Restrict Windows ACL inheritance and grant only the intended user read access.
4. Record the exact path in VS Code MCP environment configuration.
5. Confirm the package mounts it read-only to `/secrets/github-app.pem`.
6. Run `auth_check`; do not print the token.
7. Run `push_dry_run` and prove refs remain unchanged.

## Retired broker

The retired broker listened on `0.0.0.0:8080` and returned:

```text
username=x-access-token
password=<installation-token>
```

from `GET /credential`. Its source remains only for audit/migration history and is excluded from the published package.
