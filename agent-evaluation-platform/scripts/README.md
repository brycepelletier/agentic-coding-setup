# Test harness commands

`agent-evaluation-platform/test.mjs` is the only public entry point. Its subcommands select
the required internal helper and forward every argument and flag value
unchanged. Run `node agent-evaluation-platform/test.mjs --help` for the command list or
`node agent-evaluation-platform/test.mjs <command> --help` for contextual help. Invalid
options, missing values, conflicting input modes, and missing required files
return exit code 2 with the same contextual help. Paths may be relative or
absolute.

Run a single test:

```text
node agent-evaluation-platform/test.mjs single agent-evaluation-platform/test/level-1-basic-authority.md --response response.txt
```

Without `--response`, the prompt is printed. Use `--response -` for stdin.
Batch evaluation expects response files named after each test:

```text
node agent-evaluation-platform/test.mjs run responses/
```

Levels 1–3 request a strict numbered output contract up front. Their collector
still tolerates Markdown tables, headings, bold text, repeated question text,
punctuation, underscores, and explicit semantic equivalents. Levels 4–8 state
their required report structure up front; evaluation accepts varied heading
depth, numbering, capitalization, punctuation, and Markdown styling while
checking required sections, fields, and final declarations. Safe conservative
authority interpretations are recorded as non-failing notes; answers that
grant unauthorized authority remain hard failures.

Level 3 Q31 is a conditional self-audit rather than a static answer. If Q1–Q30
have no hard mismatch, Q31 must report `LEVEL 3 CONSISTENT`. If any prior answer
has a hard semantic or authority mismatch, Q31 must report
`LEVEL 3 CONTRADICTION DETECTED`; claiming consistency adds a separate hard
`SELF-AUDIT FAILURE`. Conservative note-only discrepancies do not require
contradiction detection.

For live inference, prefer a target file. `protocol` selects request, stream,
and response semantics; `path` only selects where that protocol is hosted. The
initial adapter is `openai-chat`, whose default path is `/chat/completions`.
Changing a path does not change protocol semantics. `--url` and `--models`
remain compatibility inputs for `openai-chat`:

```text
node agent-evaluation-platform/test.mjs run --targets agent-evaluation-platform/config/targets/targets.example.json --levels=2,5-8
```

The default is fail-fast per target; `--force` continues after failures:

```text
node agent-evaluation-platform/test.mjs run --url http://localhost:8080/v1 --levels=2,5-8 --models=liquidai/lfm2-24b-a2b,kat-coder-v2.5-dev-apex --force
```

Before the first level, the runner sends each live model a short greeting and
waits for its response so model loading does not distort qualification timing.
The response and telemetry are saved as `<run-id>/<model>/warmup.json` and in
the model's `warmup` object in `run.json`, with `includedInEvaluation: false`.
It is also explicitly marked `includedInAverages: false`. Warmup values never
enter qualification outcomes, averages, or ranking. Set a custom greeting with
`--warmup-prompt "Your greeting"` or the
`QUALIFICATION_WARMUP_PROMPT` environment variable. A failed warmup skips that
model's levels and advances to the next model.

Every batch run also starts or reuses the local dashboard. The browser receives
incremental snapshots over `/live` using `ws://` because the configured site is
HTTP. A future HTTPS deployment would use `wss://`. Stream progress includes
visible/reasoning character counts, elapsed time, and a bounded preview; exact
responses remain in normal evidence artifacts. `run.json` and
`live-progress.json` are written atomically while the run proceeds.

Direct live `test.mjs single` calls perform the same warmup automatically, even
when running only one test. When `--json` is supplied, the warmup response and
telemetry are stored in that result's `warmup` object and remain separate from
the test's `performance`. Batch runs warm once per model and suppress redundant
child warmups internally.

## Inference target format

A target supplies `model`, `protocol`, and either `baseUrl` or a complete
`endpoint`. It may also supply `path`, `authentication`, and
`requestParameters`. `endpoint` is already complete and cannot be combined
with `path`. Authentication should reference an environment variable so
secrets are not written to result artifacts.

```json
{
  "name": "candidate",
  "model": "provider/model-name",
  "protocol": "openai-chat",
  "baseUrl": "http://localhost:8080/v1",
  "path": "/chat/completions",
  "authentication": { "type": "bearer", "env": "OPENAI_API_KEY" },
  "requestParameters": { "temperature": 0.1, "seed": 7 }
}
```

Batch files may be one target, an array, or `{ "targets": [...] }`. Additional
protocols are added through the adapter registry; qualification tests do not
contain protocol or runtime logic.

## System instructions and evidence

The compatibility system instruction is versioned in
`config/qualification-suite.json`, not hidden in runner code. A test can override it
with `AGENT-TEST:SYSTEM:BEGIN/END` markers. `--no-system-prompt` sends only the
test prompt. Every per-test JSON records which source was used, including the
exact system prompt or `null`.

Each live per-test JSON records the test path, suite version, public target
configuration, protocol, base/endpoint and resolved path, extracted prompt,
actual protocol input/messages, request parameters, exact request body, visible
and reasoning responses, finish reason, backend usage, timing, evaluation,
and discrepancies. Raw backend stream/response text is stored beside the JSON
as `*.inference.raw.txt`; the JSON references that artifact instead of embedding
the stream. Warmup raw evidence is separate and warmup conversation messages
are never included in qualification input.

`timeToFirstVisibleTokenMs` measures the first visible response token.
`timeToFirstGeneratedTokenMs` measures the first protocol-exposed generated or
reasoning token and remains `null` when the adapter cannot observe one.

## Command reference

### `test.mjs run`

| Option | Meaning |
|---|---|
| `--targets FILE` | Target object, array, or `{ "targets": [...] }`. |
| `--protocol NAME` | Shared protocol override; default `openai-chat`. |
| `--url URL` | Shared protocol base URL. |
| `--endpoint URL` | Shared complete request endpoint. |
| `--path PATH` | Shared protocol path override. |
| `--auth-env NAME` | Bearer-token environment variable. |
| `--request-params JSON` | Shared JSON request parameters. |
| `--models LIST` | Comma-separated model identifiers; defaults to `MODEL` or `local-model`. |
| `--responses DIR` | Evaluate saved response files instead of a live endpoint. A positional directory is also accepted. |
| `--levels LIST` | Select levels and ranges, such as `1,2,4A,5-8`; default is all. |
| `--force` | Continue later levels after that model fails. Without it, fail-fast remains per model. |
| `--weighted` | Add weighted scoring/reporting without changing execution semantics. |
| `--scoring FILE` | Use a specific versioned scoring configuration with `--weighted`. |
| `--metrics FILE` | Attach collector JSON to the aggregate run JSON. |
| `--host-metrics` | Sample CPU/GPU/VRAM for every qualification request. |
| `--sample-ms MS` | Host sampling interval; default `200`. |
| `--gpu-command FILE` | GPU sampler executable; default `nvidia-smi`. |
| `--no-system-prompt` | Disable suite-default system instructions. |
| `--json FILE` | Write an additional aggregate JSON copy. |
| `--warmup-prompt TEXT` | Override the per-model greeting. |
| `--dashboard-url URL` | Printed dashboard URL; default `http://agent.eval.local:3000`. |
| `--dashboard-port PORT` | Dashboard bind port; default `3000`. |
| `--no-dashboard` | Disable dashboard startup and link output. |
| `--clear` | Remove previous run folders before creating this run. |
| `-h`, `--help` | Print help and exit. |

Live mode and saved-response mode are mutually exclusive. Live runs write
`run.json`, `qualification-summary.md`, per-model `warmup.json`, and per-test
JSON beneath `results/<run-id>/`.

`--weighted` writes `weighted-results.json` and `weighted-summary.md` in
addition to the unchanged qualification evidence and appends the weighted
leaderboard to `qualification-summary.md`. It does not imply `--force`.
Consequently, a fail-fast weighted run is marked incomplete and skipped tests
are not treated as incorrect answers. Use `--force --weighted` for a full-suite
candidate comparison. Scoring configuration, mappings, risk rules, review
sidecars, and examples are documented in [../config/SCORING.md](../config/SCORING.md).

### `test.mjs single`

| Option | Meaning |
|---|---|
| `--target FILE` | JSON inference target. |
| `--protocol NAME` | Protocol override; default `openai-chat`. |
| `--url URL` | Protocol base URL. |
| `--endpoint URL` | Complete request endpoint. |
| `--path PATH` | Protocol path override. |
| `--auth-env NAME` | Bearer-token environment variable. |
| `--request-params JSON` | Additional JSON request parameters. |
| `--model MODEL` | Model identifier; defaults to `MODEL` or `local-model`. |
| `--response FILE` | Evaluate an existing response; use `-` for standard input. |
| `--json FILE` | Save structured evaluation, raw response, performance, and live warmup data. |
| `--warmup-prompt TEXT` | Override the greeting for this direct live run. |
| `--no-system-prompt` | Send the test prompt without suite-default system instructions. |
| `--host-metrics` | Sample CPU/GPU/VRAM during the qualification request. |
| `--sample-ms MS` | Host sampling interval; default `200`. |
| `--gpu-command FILE` | GPU sampler executable. |
| `-h`, `--help` | Print help and exit. |

With neither `--url` nor `--response`, the script prints the extracted prompt.
`--url` and `--response` cannot be combined.

### Supporting commands

| Command | Usage | Purpose |
|---|---|---|
| `test.mjs evaluate` | `TEST.md [--json FILE]` | Evaluate a response read from standard input. |
| `test.mjs summary` | `RUN.json [--output REPORT.md]` | Create the ranked cross-model summary. |
| `test.mjs report` | `RUN.json [REPORT.md]` | Render detailed per-model tables. |
| `test.mjs score` | `RUN_DIRECTORY [--scoring FILE]` | Rescore persisted evidence without inference. |
| `test.mjs dashboard` | `[--results DIR] [--host HOST] [--port PORT]` | Run the dashboard server in the foreground. |
| `test.mjs metrics` | `[OUTPUT.json]` | Collect host/LMS/GPU telemetry until interrupted. |

`test.mjs score` accepts either a run directory or its `run.json`. It reloads
saved discrepancies and `<test-name>.review.json` sidecars, then rewrites only
the derived `weighted-results.json` and `weighted-summary.md`; no model request
is made. Use `--output` and `--json` to select alternate report paths.

### Environment variables

| Variable | Used by | Meaning |
|---|---|---|
| `MODEL` | Live runners | Default model identifier. |
| `OPENAI_API_KEY` | Live runners | Optional bearer token. |
| `TEMPERATURE` | Live runners | Sampling temperature; default `0.1`. |
| `QUALIFICATION_WARMUP_PROMPT` | Live runners | Default greeting override. |
| `QUALIFICATION_SAMPLE_MS` | Metrics collector | Sampling interval; default `500`. |
| `AGENT_EVAL_DASHBOARD_URL` | Batch runner | Dashboard link override; default `http://agent.eval.local:3000`. |
| `AGENT_EVAL_DASHBOARD_HOST` | Dashboard | Bind host override; default `127.0.0.1`. |
| `LMS_COMMAND` | Metrics collector | Optional LMS executable path. |
| `LMS_ARGS` | Metrics collector | Space-separated LMS arguments, such as `log stream --stats`. |
| `GPU_COMMAND` | Metrics collector | GPU command; defaults to `nvidia-smi`/`nvidia-smi.exe`. |

Every batch run writes its aggregate report to `results/<run-id>/run.json`.
Add `--json results.json` to write an additional copy elsewhere. Add
`--metrics metrics.json` to attach a collector report. Use `--json result.json`
with a single test for one result.
Live adapters request streaming when their protocol supports it so backend
usage, visible/generated latency, total time, and tokens/second can be recorded.
Unsupported telemetry remains `null`.

Convert aggregate JSON into human-readable qualification and performance tables:

```text
node agent-evaluation-platform/test.mjs report results.json report.md
```

`test.mjs run` creates a unique `agent-evaluation-platform/results/<run-id>/` folder, keeps
previous runs, and writes `run.json` plus `qualification-summary.md` at its
root. Individual test JSON files are grouped under a sanitized directory named
for each model.
Pass `--clear` to explicitly remove previous run folders before starting a new
run. Fail-fast applies independently to each model: a failed model stops, the
next model starts, and the final report is written after all models finish.
The summary ranks candidates by highest level passed, then lowest average
visible TTFT, then highest average output-token count. Candidate name is the
deterministic final tie-breaker.

Collect host metrics in a second terminal:

```text
node agent-evaluation-platform/test.mjs metrics metrics.json
```

Sampling uses `QUALIFICATION_SAMPLE_MS`. Optional runtime statistics can be
attached with `LMS_COMMAND` and `LMS_ARGS`, such as
`LMS_COMMAND=/path/to/lms LMS_ARGS="log stream --stats"`.
For request-scoped peaks, pass `--host-metrics` to `run` or `single`. The
protocol-independent sampler records overall system CPU peak, highest
single-core peak, GPU utilization peak, and allocated VRAM peak. Missing GPU
tools produce `null` GPU fields without failing qualification.

Run the answer-collection regression tests with:

```text
node --test agent-evaluation-platform/scripts/*.test.mjs
```
