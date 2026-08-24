# History and Evolution

## Timeline

### 1. Host-side local agent experiment — historical

The initial stack used LM Studio/Bionic, Cline or Roo/Cline, PowerShell, Git, and a local Qwen coder model directly under the Windows user. It proved local tool use and GitHub App authentication, but the agent inherited the user's filesystem authority, including potential access to `.ssh`.

### 2. Repository-owned `.devcontainer` — superseded

A minimal Ubuntu `.devcontainer/devcontainer.json` was created. Reopening the repository reset the effective extension/tool environment because the container was a fresh Linux workspace. This conflicted with the goal that the human remain in normal host VS Code while only the agent is sandboxed.

### 3. `projectEnvironment` / early `agent-env-mcp` — superseded naming, retained idea

A reusable MCP started and accessed a project environment, continued tasks across transitions, and released idle environments. Early versions contained both an engineering service and a Git service. Repository-local `.devcontainer` was removed after PlatformIO 6.1.19 and `pio run` succeeded through the reusable runtime.

### 4. Git isolation hardened — current principle

The engineering service masked `.git`. An indirect Python-to-Git test proved real repository state remained inaccessible. Git was delegated to a separate role.

### 5. HTTP GitHub token broker — retired

`github-token-broker` used `@octokit/auth-app` and exposed `GET /credential` on port 8080 in Git credential-helper format. Although it minted short-lived repository-scoped installation tokens, the token crossed an HTTP boundary into the development environment. This design is retired.

### 6. Final capability split — current

- `agent-env-mcp` 0.4.x: engineering only; former Git service and `git_command` removed.
- `github-app-mcp` 0.3.0: bounded local/remote Git plus proxying to the official GitHub MCP.
- `web-research-mcp` 0.1.0: bounded public research exposed directly to Software Engineer.

## Model evolution

Models experimented with or configured include Qwen2.5-Coder 1.5B, Huihui MoE 24B-A8B, Qwen3.6 12B, Qwen3-Coder 30B-A3B variants, Gemma4 26B-A4B, and Qwen3.8 27B. The current selected/default agent model is the Unsloth Qwen3-Coder 30B-A3B Instruct Q4_K_S configuration.

Fine-tuning discussion distinguished two concepts:

1. **Inference/configuration tuning actually performed:** quantization choice, context length, KV-cache quantization, GPU offload, expert count, reasoning budget, tool exposure, prompt rules, and evaluation prompts.
2. **Weight fine-tuning only proposed:** build senior-engineering trajectories and evaluations, then SFT/LoRA; compare an MoE candidate such as `gpt-oss-20b` against a dense coding baseline. No evidence shows a custom LoRA or full-weight fine-tune was trained and deployed.

## Important corrections learned

- Agent autonomy must be enforced through capabilities, not just instructions.
- Tool definitions can consume most of a 32K context; restrict each role's tools.
- A successful `git ls-remote` on a public repo does not prove App authentication; use an authenticated repository API check.
- Factory/default runtime profiles can be unsafe for Environment Controller; current firmware starts uncommissioned and templates are never automatic fallbacks.

