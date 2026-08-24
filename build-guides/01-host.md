# Stage 1 — Prepare the Host

## Goal

Create a predictable Windows foundation. Nothing agentic happens yet.

## Install

Current Windows/GPU driver, VS Code, Git for Windows/Git Bash, PowerShell 7, Node.js 24 LTS/npm, Docker Desktop with Linux containers, GitHub CLI, LM Studio/Bionic, and the VS Code Copilot/Chat/custom-agent features used by the current build.

## Storage and repositories

The current machine uses `T:\repos` and `D:\large-language-models`; choose equivalent locations. Restore `environment-controller`, `agent-env-mcp`, `github-app-mcp`, `web-research-mcp`, and `githooks` as peer repositories. Do not activate retired `github-token-broker`.

## Verify

Record versions of Node/npm, Docker client/server, Git, GitHub CLI, PowerShell, and VS Code. Start a disposable Linux container.

## Stop/go

Continue only when Docker Linux containers run, Node/npm work, and all repositories are accessible. No model or credential is configured yet.

Next: [LM Studio](02-lm-studio.md).

