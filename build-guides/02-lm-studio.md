# Stage 2 — Configure LM Studio

## Goal

Expose a local coding model through a loopback API. It has no project tools yet.

## Configure

Set model downloads to large storage. Configure server auto-start, port `8080`, interface `127.0.0.1`, CORS, JIT loading, succinct logs, and disable sensitive/token logging. Use [the verified server JSON](../lm-studio.md#current-server-configuration).

Install current model `unsloth/Qwen3-Coder-30B-A3B-Instruct-GGUF`, file `Qwen3-Coder-30B-A3B-Instruct-Q4_K_S.gguf`. Start with 40,960 context, Q8 K/V cache, 8,192 reasoning budget, one parallel session, 10 experts, and ~79.17% GPU offload on equivalent hardware. Different hardware may require changing offload first.

## Verify

Chat inside LM Studio, start the API, query the model or send a minimal completion, confirm the intended model responds, and confirm the listener is loopback-only.

## Stop/go

Continue only when a direct API request returns coherent output without exposing the service to the LAN.

Next: [VS Code model](03-vscode-model.md).

