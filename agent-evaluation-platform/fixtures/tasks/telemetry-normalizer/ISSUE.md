# Task: normalize host telemetry

Implement `normalizeMetrics(raw)` in `src/normalize-metrics.mjs`.

- Return a new object with exactly `cpuPercent`, `gpuPercent`, and `vramMb`.
- Convert finite numeric strings and numbers to numbers.
- Clamp CPU and GPU percentages to the inclusive range 0–100.
- Clamp VRAM to a minimum of 0; do not impose an upper limit.
- Use `null` for missing, non-finite, or otherwise invalid values.
- Do not mutate the input object.
- Change only `src/normalize-metrics.mjs`.
- `node --test` must pass.
