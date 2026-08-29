# Local Agent Orchestration

The installed agent definitions live in `%USERPROFILE%\.agents`. The reviewed copies in `agent-templates` are the source of truth. VS Code must point `chat.agentFilesLocations` at `~/.agents`.

`AGENTS.md` is a root-level universal policy for every kind of agent and task, including conversation, questions, research, personal planning, computer assistance, and specialist workflows. It contains only broadly applicable conduct, safety, privacy, preservation, truthfulness, and communication guidance. Software engineering behavior belongs in `software-engineer.agent.md`, not in the root file.

## Why the architecture changed

Earlier definitions relied on task wording and the current/default agent during delegation. A call intended for a specialist could therefore run as the Software Engineer, which lacked the required GitHub or Docker tools. The definitions also embedded one repository's workflow name, runner label, request identifier, hardware steps, runtime user, and toolchain in global prompts. Those assumptions were stale elsewhere and duplicated operational knowledge outside its owner.

The corrected architecture makes delegation explicit and discoverable:

- The Software Engineer owns engineering and orchestration, but has no GitHub or Docker tools.
- The GitHub Operator owns Git and GitHub lifecycle operations.
- The Docker Operator owns Docker and managed runner infrastructure.
- Every specialist call uses `runSubagent` with the exact `agentName`.
- Every specialist response includes `agent_name`, which the parent verifies.
- `agent-env/describe_agent_system` derives roles, ownership categories, allowed subagents, exact names, invocation arguments, filenames, and hashes from the installed definitions themselves.
- Discovery returns capability categories, not specialist tool schemas. The parent decides what outcome is needed; the specialist decides how to perform it.

For a ticket assignment that is not explicitly limited to an intermediate deliverable, the Software Engineer's Definition of Done is the repository-defined end-to-end lifecycle: research and definition; integration of relevant prior work; implementation, testing, and validation; commit and verified push; issue-linked PR; all required PR checks; review-comment and requested-change cycles on the same branch; semantic-versioning or release pre-merge validation; protected merge; and verification of the resulting default-branch, ticket, and post-merge state. Required human approval remains a real external gate and is never reported as completed before it occurs.

Agent frontmatter is the single registry. Each definition declares `capability-categories`; the orchestrator additionally declares `agents` and `delegation-tool: runSubagent`. Discovery fails closed for missing definitions, duplicate names, invalid categories, malformed frontmatter, multiple orchestrators, or an incorrect delegation contract.

## Synchronization

Run `powershell -File scripts/sync-agents.ps1 -Mode Check` to detect drift. Run it with `-Mode Install` to copy the reviewed templates to `%USERPROFILE%\.agents`. Use `-Mode Import` only after reviewing intentional changes made directly in the active directory. Check mode compares SHA-256 hashes and fails on missing or different files.

After changing definitions, validate both repositories, install the reviewed copies, run Check, and restart/reconnect the MCP client so it reloads the definitions and updated `agent-env` server.

## Software Engineer instruction

> Complete the requested engineering outcome and include all relevant existing staged, unstaged, and untracked work. First call `agent-env/describe_agent_system` and use the returned ownership map. For every Git or GitHub operation, call `runSubagent` with `agentName: "GitHub Operator"`. For every Docker or managed-runner operation, call `runSubagent` with `agentName: "Docker Operator"`. Never omit `agentName` or use the current/default agent. Verify that each response contains the matching `agent_name`; reject and retry an identity mismatch. Inspect and integrate every intentional behavior and useful test from prior work, reconcile the complete worktree, validate the combined implementation, then delegate the exact paths to stage. Require the GitHub Operator to review the staged patch, commit, perform a real push, verify the remote branch object ID, create or update the issue-linked pull request against the correct base, apply only repository-defined metadata, and observe required CI. Inspect repository policy before creating any release-candidate tag; if a tag is required, verify its exact name and target commit remotely. Continue through recoverable failures and report only observed results.

This instruction describes outcomes and identity requirements. It intentionally does not reproduce GitHub or Docker tool schemas; those remain in the specialist definitions.
