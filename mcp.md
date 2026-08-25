# MCP Services

If MCP is new to you, first read [Concepts](concepts.md#mcp). For installation order and isolated tests, follow the [ground-up build map](ground-up-build.md).

## Current services

| Entry | Package | Current version | Purpose |
|---|---|---:|---|
| `agent-env` | `@brycepelletier/agent-env-mcp` | 0.4.1 | Hardened reusable engineering runtime |
| `github` | `@brycepelletier/github-app-mcp` | 0.3.0 | Bounded Git plus official GitHub MCP facade |
| `web-research` | `@brycepelletier/web-research-mcp` | 0.1.0 | Credential-free bounded technical research |

## `agent-env` tools

```text
ensure_environment
list_directory
read_file
search_workspace
workspace_edit
run_command
```

`.git`, `.ssh`, and `.gnupg` are rejected by workspace tools and omitted recursively from listings/search. `.git` is also physically masked from commands.

`ensure_environment.workspace` is the authorized project root, not a parent of
the project. `run_command` accepts workspace-relative paths only: use `cwd: "."`
for a root command or a relative subdirectory such as `scripts`. Do not use an
absolute host/container path or repeat the project name. Prefer `python3` in the
Linux runtime unless the repository specifies another interpreter. For example:

```json
{"program":"python3","args":["verify_pr_validation.py"],"cwd":"."}
{"program":"python3","args":["scripts/verify_pr_validation.py"],"cwd":"."}
{"program":"python3","args":["verify_pr_validation.py"],"cwd":"scripts"}
```

The boundary remains fail-closed. Invalid paths and process-start failures
return concrete sanitized reasons, while a program that starts returns its exit
code and bounded output so script, import, dependency, permission, or network
failures can be diagnosed without broadening filesystem access.

## `github` tools

The facade combines:

- custom typed `git_local` operations in a no-network container;
- fixed `git_remote` operations (`fetch`, fast-forward-only `pull`, `push`, `ls_remote`, `auth_check`, `push_dry_run`);
- official GitHub MCP tools from `ghcr.io/github/github-mcp-server`.

Official toolsets are fixed to:

```text
context,issues,pull_requests,actions,projects
```

Remote auth mints a repository-restricted installation token inside the ephemeral container with `contents:write` and `workflows:write`, uses a private askpass helper, redacts output, and discards the token.

## `web-research`

Search uses DuckDuckGo first and Bing RSS fallback. Challenges, transport failures, and empty parsing trigger fallback; dual failure produces one sanitized error. `fetch_page` is independent, blocks loopback/private targets and credential-bearing URLs, limits downloads, and returns bounded content/navigation/find results.

## Local package development

Each package supports:

```bash
npm run link
npm test
npm run validate
npm run unlink
```

Use the globally linked binary during development; switch the VS Code MCP entry back to version-pinned `npx --yes` after publishing.
