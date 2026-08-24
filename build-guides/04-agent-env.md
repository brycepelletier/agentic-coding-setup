# Stage 4 — Build the Engineering Runtime

## Goal

Give the model a Linux workbench for source, PlatformIO, builds, and tests—without Git history, GitHub credentials, Docker control, or Windows files.

## Install

Configure `@brycepelletier/agent-env-mcp@0.4.1` from the [MCP template](../templates.md#vs-code-mcp-configuration). For package development, run `npm run link` and temporarily use the linked binary.

The trusted host launcher discovers the single VS Code root, starts Compose, and exposes six [engineering tools](../mcp.md#agent-env-tools). The workspace is mounted; `.git` is covered by inaccessible tmpfs. See [container details](../containers.md#engineering-image).

## Verify before agents

1. Call `ensure_environment` and verify workspace/Linux.
2. List/read/search an ordinary project file.
3. Perform and reverse a harmless workspace edit.
4. Run `pio --version` (6.1.19) and a project build.
5. Require `.git`, `.ssh`, and `.gnupg` access to fail.
6. Invoke real Git through Python; require “not a git repository.”
7. Confirm no GitHub variables, PEM, or Docker socket.
8. Close MCP and confirm Compose stops.

Git may be installed because build dependencies need it; authority comes from `.git` access, which is hidden.

## Stop/go

Continue only when builds work and Git state/credentials remain inaccessible.

Next: [GitHub App](05-github-app.md).

