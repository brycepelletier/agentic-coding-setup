# Troubleshooting and Dead Ends

Use this after identifying which numbered [ground-up build stage](ground-up-build.md) failed. Test the failing component independently before changing later layers or agent prompts.

## Context fills before useful work

**Symptom:** tool definitions consume most of a 32K context; compaction cannot recover.

**Fix:** narrow tools per role, use virtual tools, keep web/Git capabilities out of Software Engineer except the two required research tools, enable tool-output/terminal compaction, and load 40,960 tokens for 32,768 input + 8,192 output.

## Agent uses Windows host tools

**Cause:** prompt-only transition rules or broad terminal exposure.

**Fix:** require `agent-env/ensure_environment`, expose engineering tools only through the MCP, and fail closed on ambiguity.

## Software Engineer tells the user to commit, push, or create the PR manually

**Symptom:** after completing code changes, Software Engineer claims it cannot run Git/GitHub operations and tells the user to run `git`, `gh`, or GitHub web UI steps.

**Observed case:** delegation was available and successfully invoked. The concrete Git defect was only missing commit author identity. Software Engineer incorrectly expanded that narrow, recoverable configuration failure into abandoning commit, push, PR creation, and CI inspection.

**Cause:** completion and recovery rules were too weak. The agent treated one delegated Git failure as evidence that the entire downstream GitHub workflow was unavailable, even though the failure did not establish that conclusion.

**Fix:** keep one explicit ownership boundary. Software Engineer owns requirements, edits, builds, tests, debugging, and validation. GitHub Operator owns all local/remote Git and GitHub operations, including status/diff/history, branches, fetch/pull, staging, commit, merge/rebase, push, issues, PRs, Actions/CI, and Projects. Software Engineer must invoke the configured operator when authorized and report the actual delegation/tool error if that invocation fails; it must not fall back to manual-user instructions.

**Lesson learned:** capability separation must not fragment completion semantics. "Finish issue #N and create a PR" authorizes the end-to-end workflow through GitHub Operator. Preserve the trust domains: do not add real `.git`, GitHub credentials, or direct GitHub MCP tools to Software Engineer to compensate for a prompt/delegation defect.

## Software Engineer claims Python, ESP32, or hardware tooling is unavailable

**Symptom:** Software Engineer abandons repository scripts or required hardware validation after `run_command` rejects an absolute `cwd`, cannot find a duplicated project subdirectory, or returns an opaque runtime error.

**Observed case:** the repository tooling existed. `ensure_environment` had already reported the project root as its authorized workspace, but invocations used `/workspace`, another absolute container path, or the project name again as `cwd`. Absolute-path rejection was correct; the repeated project-relative path did not exist. The runtime then collapsed some filesystem/process errors to `Agent runtime operation failed.`, which concealed the correct recovery.

**Fix:** keep the workspace boundary and correct the invocation. Use `program: "python3"`, a script path relative to the project root, and `cwd: "."`; alternatively use a relative `scripts` directory and a script basename. `agent-env` now reports concrete sanitized path and executable startup failures, while started subprocesses return exit code, stdout, and stderr. Diagnose and retry from that evidence.

**Lesson learned:** do not infer unavailable capability from environment type; attempt the authorized tool/interface first and report concrete failure. Docker-to-project-hardware access, upload scripts, verification scripts, and other repository tooling must be tried through their authorized mechanisms before being declared unavailable. A future Hardware Agent could isolate specialized hardware responsibilities, but none is implemented in the current architecture.

## `.devcontainer` appears to reset PlatformIO/extensions

**Cause:** reopening in a fresh Linux container changes the VS Code extension/tool environment.

**Resolution:** retain host VS Code for the human; move reusable agent execution into `agent-env-mcp`. The repo-local `.devcontainer` experiment is superseded.

## Tracked local edits appear lost during branch operations

An early test displaced local `AGENTS.md` and configuration changes. The agent later preserved/restored them, but the episode established hard repository-preservation rules. Never reset/clean/check out over unrelated work; inspect status and request approval for destructive operations.

## `git ls-remote` succeeds but auth may still be broken

Public repositories permit anonymous `ls-remote`. Use `git_remote auth_check`, which calls an authenticated repository endpoint, and use `push_dry_run` for authenticated Git transport without ref mutation.

## Git works indirectly from engineering runtime

If Python/Node can launch Git, that is not itself a breach. The expected hardened result is Git code 128 because `.git` is masked. If branch/status is returned, stop and audit the mount.

## DuckDuckGo returns HTTP 202 / empty results

The endpoint may challenge automation. Current `web-research-mcp` detects challenges and falls back to Bing RSS. Empty success must not be reported as valid search.

## Large documentation page rejected

Wire download and returned character limits are separate. Current page retrieval allows a larger bounded download while returning at most the requested content limit.

## LM Studio model loops/repeats

Alternative configs used rolling-window overflow, presence penalty 1.5, repeat penalty 1.2, and sampling adjustments. Apply model-specific changes only after a reproducible evaluation; do not copy settings blindly between architectures.

## MCP does not reflect linked package changes

Restart the MCP server or reload VS Code. Existing stdio processes retain the old code.

## PEM or installation config fails

- Confirm all three environment values are present.
- Confirm IDs are positive integers.
- Confirm the exact host path points to a readable regular file.
- Confirm App installation includes the target repository and required permissions.
- Never debug by printing the PEM, JWT, installation token, or environment dump.
