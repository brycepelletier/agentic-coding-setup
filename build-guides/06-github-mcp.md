# Stage 6 — Build the Git/GitHub Capability

## Goal

Expose one bounded MCP for local Git, authenticated remote Git, and official GitHub APIs.

## Install

Configure `@brycepelletier/github-app-mcp@0.3.0` with App ID, installation ID, and exact host PEM path using the [MCP template](../templates.md#vs-code-mcp-configuration).

Local Git gets real `.git` but no network/PEM. Remote Git gets real `.git`, GitHub network, read-only PEM, and internally minted authentication. Official API tools come from `ghcr.io/github/github-mcp-server` with fixed `context,issues,pull_requests,actions,projects` toolsets.

## Verify before agents

1. Local status returns branch/tree state.
2. `auth_check` confirms authenticated, authorized, HTTPS, no exposure.
3. Record remote branch object ID with `ls_remote`.
4. Run `push_dry_run`.
5. Require the object ID to remain unchanged.
6. Reject force/deletion/arbitrary arguments.
7. Confirm local mode has no network/PEM and responses contain no credential.
8. Close MCP and confirm only its unique child is removed.

`ls_remote` alone is not authentication proof for a public repository.

## Stop/go

Continue only when both Git modes work, the dry run changes nothing, and credentials stay invisible.

Next: [Research MCP](07-web-research.md).

