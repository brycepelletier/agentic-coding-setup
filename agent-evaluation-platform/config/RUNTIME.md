# Runtime orchestration qualification

Run deterministic regressions from agent-evaluation-platform:

```
node --test scripts/orchestration-runtime.test.mjs scripts/real-git-chain.test.mjs
```

The seven scenarios cover actual requested push vs preflight, runner creation and GitHub handoff, recoverable failure, context overflow with compact redelegation, dry-run-only specialist output, capability-domain denial, and invalid parent-capability refusal. The disposable Git integration test performs a real dry-run and push to a local bare repository and reads the resulting ref. It does not mutate a user repository or GitHub. Docker creation is stateful mock-backed; a live runner requires a separately authorized correlated workflow.

Run real parent/specialist model turns against the stateful service doubles:

```
node test.mjs runtime --model MODEL --url http://localhost:8080/v1 --output runtime-results.json
```

Use --scenario NAME for diagnosis; a partial run never qualifies the whole suite. Runtime qualification requires the tool action, matching verification, specialist identity/evidence returned to the parent, and parent continuation/final evidence. Narrative-only completion, preflight alone, or a parent reporting failure after child tool activity does not pass. Context overflow must produce a shorter fresh delegation. Each role is bounded to 16 turns and each specialist to three invocations; partial evidence and execution errors are retained. No scripted test can qualify a model.

Results explicitly identify mock-backed-runtime and liveRuntimeQualified=false. Existing policy/controlled-workspace scores remain independent and cannot upgrade this field. Live service probes use scripts/verify-local-mcp.mjs from the repository root with the configured MCP entry. They are opt-in, require local dependencies and Docker, and preserve the engineering/GitHub/Docker capability boundaries. Reconnect existing VS Code MCP sessions to pick up launch configuration changes.
