# Stage 10 — Restore CI/CD

## Goal

Make an independent system—not an agent's narrative—decide whether changes qualify for release candidates.

## Runner

Register a self-hosted Windows x64 runner labeled `environment-controller-ci`. Docker must be available. Keep the repository private because workflow code runs with runner-account machine authority. Start visibly with `.github/ci/runner-hooks/run-visible.sh`; show the workflow URL first and stop cleanly with Ctrl+C.

## Workflows

- `firmware.yml`: PR/manual validation, containerized checks/builds, physical/mock release packages, commit-specific artifact.
- `post-merge.yml`: verify merged PR output, download packages, create immutable RC tag/assets/prerelease.

See [CI/CD reference](../ci-cd.md) for versioning, immutability, and the production-promotion gap.

## Verify

Dispatch PR validation, observe every job, confirm packages match head SHA, and—when appropriate—confirm post-merge reuses validated packages and creates immutable RC outputs. GitHub Operator must inspect actual workflow/job results.

## Stop/go

The build is complete only when CI succeeds, artifacts trace to the exact commit, and [full verification](../verification.md) passes.

