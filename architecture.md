# Architecture, Explained in Layers

Read [Start Here](start-here.md) and [Concepts](concepts.md) first.

## Layer 1 — User experience

The user chooses Software Engineer in VS Code. It handles coding and delegates repository operations.

## Layer 2 — Intelligence versus capability

LM Studio/Qwen supplies intelligence. Agent prompts assign jobs. MCP tools expose actions. Containers enforce filesystem/network boundaries. Changing the model does not automatically change authority.

## Layer 3 — Roles and infrastructure

```text
Software Engineer                    GitHub Operator
       |                                    |
agent-env-mcp                         github-app-mcp
       |                         +----------+----------+
Linux engineering runtime        bounded Git       official GitHub MCP
source visible                    real .git         GitHub API
.git masked                       local:no network  App authentication
no credentials/socket            remote:App auth   fixed toolsets
```

## Layer 4 — Follow a build

VS Code calls `ensure_environment`; the host launcher starts Linux; the workspace is mounted; `.git` is hidden; PlatformIO/build/test commands run; results return without GitHub credentials. See [agent-env guide](build-guides/04-agent-env.md).

## Layer 5 — Follow a push

Software Engineer delegates. GitHub Operator validates status and App authorization. An ephemeral remote-Git container sees real `.git`, GitHub network, and read-only PEM; it mints/uses/discards a token internally and scrubs output. See [GitHub MCP guide](build-guides/06-github-mcp.md).

## Layer 6 — Trust-domain audit

Now the comparison table has context:

| Place | Purpose | Source | Real `.git` | Network | GitHub auth |
|---|---|---:|---:|---:|---:|
| Engineering runtime | Edit/build/test | Yes | No | As configured | No |
| Local Git runtime | Local history | Yes | Yes | No | No |
| Remote Git runtime | Fetch/pull/push | Yes | Yes | GitHub | Internal/temporary |
| Official GitHub MCP | Issues/PRs/CI/Projects | N/A | N/A | GitHub | Internal/temporary |
| Trusted host launcher | Create controlled containers | Selected workspace | Infrastructure | Yes | Configured where required |

## Layer 7 — Discovery and cleanup

MCP facades require exactly one local workspace from `roots/list`; the model cannot choose arbitrary host paths. Engineering Compose shuts down on close/signals/errors, with a 15-minute idle fallback. Git containers are ephemeral. No model-controlled container gets the Docker socket.

## Security proof

Python launched real Git in the engineering runtime, but Git returned code 128 / “not a git repository.” The executable existed; protected metadata did not. This proves a filesystem boundary rather than model obedience.

