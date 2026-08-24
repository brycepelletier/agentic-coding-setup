# Stage 5 — Create the GitHub App

## Goal

Create a machine identity without using the human's personal token or SSH credentials.

## Create

Create a user-owned App. Grant only required repository permissions for Contents, Issues, Pull Requests, Workflows, Actions, Projects, Metadata, and Checks. Install it on selected repositories, initially Environment Controller. Record App ID and installation ID. Generate a PEM, move it outside every repository, remove inherited ACLs, and grant the intended Windows user read access.

The existing deployment is `bp-agent-github-app`, App ID `4618233`, installation ID `154276908`; a new App gets different IDs. Webhook selections were explored, but no deployed receiver is verified.

## Verify

From trusted host code, prove PEM -> JWT -> installation token -> authenticated repository API without printing any secret. Record only repository identity and expiry.

## Stop/go

Continue only when selected-repository access succeeds and PEM/JWT/token remain hidden.

Next: [GitHub MCP](06-github-mcp.md). Reference: [GitHub App](../github-app.md).

