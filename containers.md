# Container Architecture

If images, containers, and mounts are unfamiliar, read [Concepts](concepts.md#container-image-and-mount) and [Stage 4 — Engineering Runtime](build-guides/04-agent-env.md) first.

## Engineering image

Current base and principal contents:

```dockerfile
FROM node:24.19.0-bookworm-slim
ARG PLATFORMIO_VERSION=6.1.19
# bash, build-essential, cmake, curl, git, gnupg, ninja,
# python3/venv/pip, ripgrep, unzip, wget, xz-utils
# PlatformIO installed in /opt/platformio
USER vscode
```

Compose mounts the active workspace, runs as `vscode`, drops all capabilities, enables `no-new-privileges`, and over-mounts `${workspace}/.git` with mode `000` tmpfs. No Docker socket or credentials are mounted.

## Git image

Current base is also `node:24.19.0-bookworm-slim`, with only CA certificates, Git, Node dependencies, and the Git helper. It runs as unprivileged `github-app` with all capabilities dropped and `no-new-privileges`.

Local Git:

```yaml
network_mode: none
# workspace mounted with real .git
# no PEM
```

Remote Git:

```yaml
# GitHub network available
# workspace mounted with real .git
# PEM mounted read-only
# token minted and consumed internally
```

## Why the application `.devcontainer` was removed

The application-specific container duplicated reusable infrastructure and forced the human IDE into the container. `agent-env-mcp` now owns the Linux runtime, so `environment-controller/.devcontainer` is intentionally absent.

## Known limitation

The `.git` tmpfs masking assumes a standard checkout where `.git` is a directory. Git worktrees and submodules commonly use a `.git` file; reject them or design a separate mount strategy before claiming the same boundary.
