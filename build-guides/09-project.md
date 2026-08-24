# Stage 9 — Integrate Environment Controller

## Goal

Add project-specific policy and prove the generic runtime builds the real embedded application.

## Configure

Keep `AGENTS.md` at repository root. It adds execution, preservation, cost, visible-runner, verification, reporting, and UTC timestamp rules. The application intentionally has no `.devcontainer`; agent-env owns the runtime.

## Verify

Open Environment Controller as the only workspace root. Ask Software Engineer to read/apply `AGENTS.md`, gate the environment, run PlatformIO version, firmware and LittleFS builds, targeted tests, and applicable lint/coverage. Request branch/status through delegation. Confirm unrelated changes remain.

Firmware configuration, mock sensors, OTA, telemetry, and safety state are application topics documented in its README; they are not prerequisites for the agent platform.

## Stop/go

Continue only when the project builds without `.devcontainer` and Git work still delegates.

Next: [CI/CD](10-ci-cd.md).

