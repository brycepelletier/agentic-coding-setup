# Stage 3 — Connect VS Code to the Model

## Goal

Register the local endpoint and prove VS Code can use it before adding MCP tools.

## Configure

Create `%APPDATA%\Code\User\chatLanguageModels.json` from the [model template](../templates.md#vs-code-local-model-registry). The URL is `http://localhost:8080/v1/chat/completions`; tool calling is true; vision is false; input/output limits are 32,768/8,192.

Set plan, inline, and explore defaults to Qwen. Enable tool-output and terminal compaction and keep the virtual-tool threshold small.

## Verify

Reload VS Code, select Qwen, ask it to explain a short code sample without tools, and confirm the LM Studio server receives the request.

## Stop/go

Continue only when local responses are reliable. If later tools fail, debug tool calling/model ID/template separately from agent prompts.

Next: [agent-env](04-agent-env.md).

