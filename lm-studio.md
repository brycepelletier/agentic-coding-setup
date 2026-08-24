# LM Studio and Local Models

New to local models? Read [Start Here](start-here.md) and [Concepts](concepts.md#model-server) before using this settings reference. The systematic setup is [Stage 2 — LM Studio](build-guides/02-lm-studio.md).

## Current server configuration

The OpenAI-compatible server auto-starts on LM Studio launch:

```json
{
  "autoStartOnLaunch": true,
  "port": 8080,
  "cors": true,
  "logSensitiveData": false,
  "logIncomingTokens": false,
  "verbose": false,
  "logLinesLimit": 500,
  "networkInterface": "127.0.0.1",
  "justInTimeModelLoading": true,
  "fileLoggingMode": "succinct"
}
```

The API is loopback-only at `http://localhost:8080/v1`. JIT-loaded models are configured for a one-hour TTL. Model downloads are stored at `D:\large-language-models`.

## Current primary agent model

```text
Model: unsloth/Qwen3-Coder-30B-A3B-Instruct-GGUF
File:  Qwen3-Coder-30B-A3B-Instruct-Q4_K_S.gguf
Quantization: Q4_K_S
Context: 40,960 tokens loaded
VS Code advertised input: 32,768
VS Code maximum output: 8,192
Reasoning budget: 8,192
KV cache: K=q8_0, V=q8_0
GPU offload ratio: 0.7916666667
Parallel sessions: 1
Loaded experts: 10
Tool calling: enabled
Vision: disabled
```

The 40,960-token load allocation matches 32,768 input plus 8,192 output. This is deliberate; earlier 32K sessions failed when tool definitions alone consumed most of context.

## Other registered model endpoints

| Model | VS Code input/output | Tools | Vision | Status |
|---|---:|---:|---:|---|
| Qwen2.5-Coder 1.5B Q8_0 | 24,576 / 8,192 | No | No | Utility/legacy |
| Huihui MoE 24B-A8B Q4_K_M | 32,768 / 8,192 | Yes | No | Alternative |
| Qwen3.6 12B IQ Q8_0 | 32,768 / 8,192 | Yes | No | Alternative |
| Qwen3-Coder 30B-A3B Q4_K_S | 32,768 / 8,192 | Yes | No | Current primary |
| Gemma4 26B-A4B Q4_K_M | 32,768 / 8,192 | Yes | No | Alternative |
| Qwen3.8 27B | 32,768 / 8,192 | Yes | Yes | Alternative/vision |

## What “tuning” means in this setup

The deployed agents were tuned primarily at the system level:

- model/quant selection for memory and throughput;
- explicit context and output budgets;
- Q8 KV-cache quantization;
- partial GPU offload;
- MoE expert loading;
- tool-calling declarations;
- narrowly scoped agent prompts and MCPs;
- deterministic boundary tests and real repository tasks;
- output/tool compaction in VS Code.

No verified deployed custom weight fine-tune exists. Do not describe these settings as LoRA/SFT training.

## Reusable endpoint template

See [templates.md](templates.md#vs-code-local-model-registry). Keep the endpoint on loopback unless there is a separately designed authentication and network boundary.
