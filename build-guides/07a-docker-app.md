# Stage 7A — Build the Docker Runner Capability

## Goal

Expose a narrow MCP for Docker daemon checks and one Dockerized GitHub Actions
runner without giving an agent an arbitrary Docker CLI, shell, socket, or
authority over unrelated resources.

## Install

Configure `@brycepelletier/docker-app-mcp@0.1.0` from the
[MCP template](../templates.md#vs-code-mcp-configuration). The published
configuration uses version-pinned `npx --yes`. For package development, run
`npm run link` in `docker-app-mcp` and temporarily set the MCP command to the
linked `docker-app-mcp` binary; run `npm run unlink` and restore the pinned
`npx` entry after publishing.

Open `environment-controller` as the single VS Code workspace root. The MCP
accepts that root for runner-image builds and rejects other workspace names.
It exposes only `docker_status`, `list_managed_resources`,
`build_runner_image`, `start_runner`, `runner_status`, `runner_logs`, and
`stop_runner`.

`start_runner` consumes the one-time opaque registration capability issued by
`github-app-mcp`. The credential must never appear in agent messages, tool
results, logs, configuration, or committed files.

## Verify before agents

1. Run `npm run validate`; require syntax, tests, and `npm pack --dry-run` to pass.
2. Start the pinned `npx` MCP. Require the exact seven-tool inventory above and no arbitrary Docker/shell tool.
3. Call `docker_status`; require Linux `x86_64` Docker daemon evidence.
4. Require managed-resource listings to be ownership-label filtered.
5. Build the runner image from the authorized Environment Controller root.
6. Verify image user `se-agent` and required runner/toolchain executables.
7. Require malformed request IDs and mutation of unlabeled or mismatched resources to fail closed.
8. Verify a test capability is opaque, expires, and is single use without exposing its credential.

Do not register a live runner merely to test installation. Live registration
belongs to a correlated run using `pr-<PR_NUMBER>-<GITHUB_WORKFLOW_RUN_ID>`.

## Stop/go

Continue only when discovery is exact, image execution is non-root,
ownership-label enforcement passes, and credentials remain invisible.

Next: [Agents](08-agents.md).
