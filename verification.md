# Verification Checklist

## LM Studio

- [ ] Server listens only on `127.0.0.1:8080`.
- [ ] Sensitive data and incoming-token logging are disabled.
- [ ] Qwen3-Coder tool calling works.
- [ ] Effective budget supports 32,768 input + 8,192 output.

## Engineering boundary

- [ ] `ensure_environment` reports the expected Linux workspace.
- [ ] Directory/read/search/edit/build/test tools work.
- [ ] Direct `.git`, `.ssh`, and `.gnupg` access is rejected.
- [ ] Indirect Python/Node invocation of Git cannot obtain branch/status.
- [ ] No GitHub credential variables, PEM, or installation token are visible.
- [ ] Docker socket is absent.
- [ ] Closing MCP removes its Compose containers.

## Agent definitions

- [ ] Software Engineer appears with only `agent-env/*`, two `web-research` tools, todo, and GitHub/Docker Operator delegation.
- [ ] GitHub Operator is not user-invocable and exposes only the explicitly listed Git/GitHub tools.
- [ ] Docker Operator is not user-invocable and exposes only `docker-app/*`.
- [ ] Software Engineer delegates branch/status rather than attempting Git directly.
- [ ] GitHub Operator refuses source editing and runs its independent repository gate.
- [ ] The legacy standalone Web Search agent is not active in the current setup.

## GitHub boundary

- [ ] Exactly one local MCP root is accepted; zero/multiple/non-file roots fail.
- [ ] Local Git runs with `network=none` and no PEM.
- [ ] `auth_check` reports authenticated/authorized without credential exposure.
- [ ] `push_dry_run` succeeds and remote object IDs remain unchanged.
- [ ] Force/deletion/arbitrary argument inputs are rejected.
- [ ] Official tool inventory is limited to context/issues/PRs/actions/projects.
- [ ] Closing the facade removes only its uniquely named child container.

## Web research

- [ ] Domain-filtered search returns bounded results.
- [ ] DuckDuckGo challenge triggers bounded Bing fallback.
- [ ] `fetch_page` supports `find` and bounded navigation links.
- [ ] Loopback/private and credential-bearing URLs are rejected.
- [ ] Oversized result limits are rejected by schema.

## Docker boundary

- [ ] Version-pinned `npx` discovers exactly the seven documented Docker tools.
- [ ] No arbitrary Docker command, shell, host path, or Docker socket tool exists.
- [ ] Runner image builds only from the authorized Environment Controller root.
- [ ] Image runs as `se-agent` with Actions runner and required CI toolchain.
- [ ] Mutation refuses resources without matching managed/request labels.
- [ ] Registration capability is opaque, expiring, and single use.
- [ ] `runner_ready_handle` does not claim GitHub-side workflow success.

## Environment Controller

- [ ] PlatformIO Core 6.1.19 is present in the engineering runtime.
- [ ] `pio run` and `pio run --target buildfs` succeed.
- [ ] Targeted host tests/lint/coverage run as configured.
- [ ] PR workflow succeeds on the labeled self-hosted runner.
- [ ] Release packages are retained and matched to the PR head SHA.
- [ ] Post-merge creates immutable RC tag/assets without overwriting.
