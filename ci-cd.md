# Environment Controller CI/CD

For the beginner build sequence, start with [Stage 10 — Restore CI/CD](build-guides/10-ci-cd.md). This page is the implementation reference.

## Current workflows

### `Firmware PR validation` (`.github/workflows/firmware.yml`)

Triggers on pull requests and manual `workflow_dispatch`. It uses an ephemeral self-hosted Linux x64 runner container labeled `environment-controller-ci`. The pinned runner image contains the CI toolchain, so project checks run directly in the Actions workspace. It collects physical and mock release packages and uploads them as a commit-specific artifact.

### `Post-merge delivery` (`.github/workflows/post-merge.yml`)

Triggers on pushes to the delivery branch (currently governed by the workflow). It verifies the merged PR result, downloads the previously validated release packages, retains them, packages release assets, creates an annotated release-candidate tag, and publishes a GitHub prerelease without overwriting existing tags/assets.

## Runner architecture

```text
GitHub Actions job
  -> queued correlated workflow run
  -> Docker Operator starts ephemeral Linux x64 runner
  -> non-root se-agent Actions workspace
  -> lint/tests/PlatformIO builds/package verification
```

GitHub Operator issues a single-use opaque registration capability. Docker
Operator consumes it without exposing the token and returns a
`runner_ready_handle`. GitHub Operator independently verifies the runner is
online and correctly labeled before observing the workflow.

## Version and immutability model

`version.env` is the version source for firmware target, release-candidate tag, and production tag. Release tags and assets are immutable: reuse with different contents fails. Runner/toolchain versions are pinned in `cots-versions.env` and the runner Dockerfile.

The build ID is based on Git revision plus `-dirty` for uncommitted changes. CI records deterministic results independently of any agent narrative.

## Current production gap

The current post-merge flow creates a release candidate, not the production tag. Bare-metal functional qualification and direct production promotion remain future work.

## Agent integration

GitHub Operator can inspect/trigger Actions and authorize registration. Docker
Operator owns only runner infrastructure. Software Engineer coordinates the
typed handoff. Project policy requires the workflow to be authoritative; no
agent may claim runner readiness or workflow success without its owning tool's
observed evidence.
