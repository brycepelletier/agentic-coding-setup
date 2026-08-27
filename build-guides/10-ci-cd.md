# Stage 10 — Restore CI/CD

## Goal

Make an independent system—not an agent's narrative—decide whether changes qualify for release candidates.

## Runner

GitHub Operator identifies the authoritative queued run and issues a correlated opaque registration capability. Docker Operator builds and starts an ephemeral Linux x64 runner container labeled `environment-controller-ci`. The image runs as non-root `se-agent` with the CI toolchain directly installed. GitHub Operator independently verifies `self-hosted`, `linux`, `x64`, and `environment-controller-ci` before observing the run.

## Workflows

- `firmware.yml`: PR/manual validation with direct in-runner checks/builds, physical/mock release packages, and a commit-specific artifact.
- `post-merge.yml`: verify merged PR output, download packages, create immutable RC tag/assets/prerelease.

See [CI/CD reference](../ci-cd.md) for versioning, immutability, and the production-promotion gap.

## Verify

Dispatch PR validation, observe every job, confirm packages match head SHA, and—when appropriate—confirm post-merge reuses validated packages and creates immutable RC outputs. GitHub Operator must inspect actual workflow/job results.

## Stop/go

The build is complete only when CI succeeds, artifacts trace to the exact commit, and [full verification](../verification.md) passes.
