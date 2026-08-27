# Architecture, Explained in Layers

Read [Start Here](start-here.md) and [Concepts](concepts.md) first.

## Layer 1 — User experience

The user chooses Software Engineer in VS Code. It owns requirements, code edits, builds, tests, debugging, and validation, and it invokes GitHub Operator for the complete repository lifecycle and GitHub operations. A request such as "finish issue #N and create a PR" is one end-to-end outcome; the user does not have to separately request each branch, commit, push, or PR step.

## Layer 2 — Intelligence versus capability

LM Studio/Qwen supplies intelligence. Agent prompts assign jobs. MCP tools expose actions. Containers enforce filesystem/network boundaries. Changing the model does not automatically change authority.

## Layer 3 — Roles and infrastructure

```text
Software Engineer              GitHub Operator             Docker Operator
       |                              |                           |
agent-env-mcp                   github-app-mcp               docker-app-mcp
       |                    +---------+---------+          structured runner tools
Linux engineering runtime   bounded Git   official API    managed containers only
.git masked                  real .git     App auth        no arbitrary CLI/shell
no credentials/socket       runner authorization          label-gated mutation
```

## Layer 4 — Follow a build

VS Code calls `ensure_environment`; the host launcher starts Linux; the workspace is mounted; `.git` is hidden; PlatformIO/build/test commands run; results return without GitHub credentials. See [agent-env guide](build-guides/04-agent-env.md).

## Layer 5 — Follow a push

Software Engineer delegates. GitHub Operator validates status and App authorization. An ephemeral remote-Git container sees real `.git`, GitHub network, and read-only PEM; it mints/uses/discards a token internally and scrubs output. See [GitHub MCP guide](build-guides/06-github-mcp.md).

The ownership boundary is capability separation, not a workflow handoff to the user. Software Engineer must use its configured delegation path instead of telling the user to run `git`, `gh`, or GitHub web UI steps. If delegation fails, it reports the concrete delegation/tool error. Do not give Software Engineer GitHub credentials, direct GitHub MCP tools, or access to real `.git` as a workaround.

## Layer 6 — Follow a CI runner request

GitHub Operator identifies the authoritative queued workflow and issues a
single-use opaque registration capability. Software Engineer forwards the
complete `RUNNER_REQUIRED` object to Docker Operator. Docker Operator builds
and starts the managed Linux runner, then returns `runner_ready_handle`.
GitHub Operator independently verifies the runner and workflow state. See the
[Docker MCP guide](build-guides/07a-docker-app.md).

## Layer 7 — Trust-domain audit

Now the comparison table has context:

| Place | Purpose | Source | Real `.git` | Network | GitHub auth |
|---|---|---:|---:|---:|---:|
| Engineering runtime | Edit/build/test | Yes | No | As configured | No |
| Local Git runtime | Local history | Yes | Yes | No | No |
| Remote Git runtime | Fetch/pull/push | Yes | Yes | GitHub | Internal/temporary |
| Official GitHub MCP | Issues/PRs/CI/Projects | N/A | N/A | GitHub | Internal/temporary |
| Docker Operator | Managed runner lifecycle | Runner build context | N/A | Docker/GitHub runner | Opaque capability only |
| Trusted host launcher | Create controlled containers | Selected workspace | Infrastructure | Yes | Configured where required |

## Layer 8 — Discovery and cleanup

MCP facades require exactly one local workspace from `roots/list`; the model cannot choose arbitrary host paths. Engineering Compose shuts down on close/signals/errors, with a 15-minute idle fallback. Git containers are ephemeral. No model-controlled container gets the Docker socket.

## Security proof

Python launched real Git in the engineering runtime, but Git returned code 128 / “not a git repository.” The executable existed; protected metadata did not. This proves a filesystem boundary rather than model obedience.
