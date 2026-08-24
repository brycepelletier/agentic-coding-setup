# Environment Controller CI/CD

For the beginner build sequence, start with [Stage 10 — Restore CI/CD](build-guides/10-ci-cd.md). This page is the implementation reference.

## Current workflows

### `Firmware PR validation` (`.github/workflows/firmware.yml`)

Triggers on pull requests and manual `workflow_dispatch`. It uses a self-hosted Windows x64 runner labeled `environment-controller-ci`, validates Docker availability, and runs project checks inside the pinned build-runner container. It collects physical and mock release packages and uploads them as a commit-specific artifact.

### `Post-merge delivery` (`.github/workflows/post-merge.yml`)

Triggers on pushes to the delivery branch (currently governed by the workflow). It verifies the merged PR result, downloads the previously validated release packages, retains them, packages release assets, creates an annotated release-candidate tag, and publishes a GitHub prerelease without overwriting existing tags/assets.

## Runner architecture

```text
GitHub Actions job
  -> self-hosted Windows runner
  -> Docker Engine
  -> pinned Linux build-runner image
  -> lint/tests/PlatformIO builds/package verification
```

The runner wrapper is started visibly through `.github/ci/runner-hooks/run-visible.sh`, with the workflow URL shown first. It remains open until terminal workflow state and is stopped with Ctrl+C so the runner releases its session cleanly.

## Version and immutability model

`version.env` is the version source for firmware target, release-candidate tag, production tag, and build-runner version. Build-runner Docker tags, release tags, and release assets are immutable: reuse with different contents fails.

The build ID is based on Git revision plus `-dirty` for uncommitted changes. CI records deterministic results independently of any agent narrative.

## Current production gap

The current post-merge flow creates a release candidate, not the production tag. Bare-metal functional qualification and direct production promotion remain future work.

## Agent integration

GitHub Operator can inspect/trigger Actions through the official MCP `actions` toolset. Project policy requires the existing CI/CD workflow to be the authoritative final verification path when applicable. An agent must not claim workflow success without observing it.
