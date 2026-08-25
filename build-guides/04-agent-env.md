# Stage 4 — Build the Engineering Runtime

## Goal

Give the model a Linux workbench for source, PlatformIO, builds, and tests—without Git history, GitHub credentials, Docker control, or Windows files.

## Install

Configure `@brycepelletier/agent-env-mcp@0.4.1` from the [MCP template](../templates.md#vs-code-mcp-configuration). For package development, run `npm run link` and temporarily use the linked binary.

The trusted host launcher discovers the single VS Code root, starts Compose, and exposes six [engineering tools](../mcp.md#agent-env-tools). The workspace is mounted; `.git` is covered by inaccessible tmpfs. See [container details](../containers.md#engineering-image).

The workspace reported by `ensure_environment` is already the project root.
Pass only relative paths to workspace tools. For `run_command`, use `cwd: "."`
for root scripts or a relative directory such as `scripts`; do not use
`/workspace`, the reported absolute container path, or the project name again.
Prefer `python3` for Python commands in this Linux runtime unless the repository
defines another interpreter. A failed command should expose a concrete path,
executable, policy, permission, or subprocess result that can be corrected and
retried.

## Verify before agents

1. Call `ensure_environment` and verify workspace/Linux.
2. List/read/search an ordinary project file.
3. Perform and reverse a harmless workspace edit.
4. Run `pio --version` (6.1.19) and a project build.
5. Run a repository Python script with `python3`, a project-root-relative script path, and `cwd: "."`.
6. Confirm a nonexistent relative `cwd` and executable return concrete errors.
7. Require `.git`, `.ssh`, and `.gnupg` access to fail.
8. Invoke real Git through Python; require “not a git repository.”
9. Confirm no GitHub variables, PEM, or Docker socket.
10. Close MCP and confirm Compose stops.

Git may be installed because build dependencies need it; authority comes from `.git` access, which is hidden.

## Stop/go

Continue only when builds work and Git state/credentials remain inaccessible.

Next: [GitHub App](05-github-app.md).
