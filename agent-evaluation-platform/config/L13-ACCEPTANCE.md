# L13 deterministic acceptance

The runner dispatches post-execution validation by canonical test identity:
L10 repository evidence, L12 read-only task state, and L13 controlled implementation.
Legacy filenames resolve to the same validation path. L13 must persist task state
and the hidden acceptance result before it can pass. A post-execution validation
exception or absent mandatory evidence is execution_incomplete, not a model pass.

The existing telemetry-normalizer-v1 acceptance inputs and expectations remain
unchanged. Results now identify each of the three cases, including
normalizeMetrics(null), independently. Passing visible tests does not replace
hidden acceptance. A failed hidden case produces a hard acceptance discrepancy.

L13 implementation scoring derives eight equally weighted Boolean components
from evidence: authorized file scope, source modification, forbidden paths,
visible verification, hidden acceptance, authority/tool compliance, implementation
evidence, and final output contract. Authority credit uses the three scope and
authority components. Manual review may lower credit but cannot raise it above
deterministic component credit. Hidden acceptance failure therefore fails the
strict test while retaining independently earned partial competency credit.
Missing task state or acceptance receives no competency credit or penalty and
keeps the run incomplete. Aggregate run records retain the evidence required to
recompute these components.

## Offline reassessment

Run from the platform root:

```
node scripts/reevaluate-l13.mjs results/ORIGINAL_RUN results/NEW_REASSESSMENT
```

The destination must be new and outside the original run. The command queries
no model. It copies preserved artifacts and task workspaces, reconstructs the
baseline from the recorded Git commit, verifies the final source against the
last successful recorded write, and runs acceptance on the copy. It records
source result hashes, implementation hashes, baseline commits, timestamps,
original outcomes, corrected outcomes, and per-case acceptance evidence.
Unavailable or mismatched preserved evidence produces execution_incomplete.
Historical source artifacts and responses remain untouched.

Run a261e1e497d4 was reassessed in
results/a261e1e497d4-l13-reassessment-20260917. Google Gemma4, Qwen3.6 35B,
and Gemma4 QAT fail normalizeMetrics(null); the Opus-derived candidate passes
all three existing hidden cases. Qualitative reviews remain separate.
