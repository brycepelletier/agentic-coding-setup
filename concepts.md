# Concepts and Glossary

## Model, server, and context

A **language model** generates text. Qwen3-Coder runs locally. By itself it cannot read files or contact GitHub. **LM Studio** is the model server; it exposes `http://127.0.0.1:8080/v1`. The **context window** is working memory containing instructions, messages, tool definitions, and results. The primary load is 40,960 tokens: 32,768 input plus 8,192 output.

## Agent and tool

An **agent** is a model plus instructions, tools, and sometimes delegation. A **tool** is a structured action such as `read_file`, `run_command`, or `git_local`. Structured inputs can be validated and are safer than arbitrary shell strings.

## MCP

Model Context Protocol connects VS Code to tool servers:

```text
VS Code agent -> MCP request -> local MCP program -> container/GitHub/files
              <- structured result <----------
```

## Container, image, and mount

A Docker **image** is a reusable Linux/tool recipe; a **container** is a running instance. A **mount** makes an explicitly selected host path visible inside it. The workspace is mounted for editing, while the engineering container covers `.git` with an inaccessible temporary mount.

## Git and GitHub

**Git** manages local history: status, diff, branches, commits. **GitHub** hosts the remote and adds PRs, issues, Actions, and Projects. GitHub Operator owns both so repository history has one owner.

## GitHub App and credentials

A **GitHub App** is a machine identity installed on selected repositories with explicit permissions. Its private PEM signs a short-lived JWT, which obtains an installation token. A credential proves identity; its file path may be configured, but contents must never reach the model.

## Least privilege and trust boundary

**Least privilege** gives each component only what it needs. A **trust boundary** is where capability or sensitive-data access changes:

```text
Engineering container: source yes, .git no, credential no
        | delegation
Local Git container: source/.git yes, network/credential no
Remote Git container: source/.git yes, GitHub network, temporary internal auth
```

No model-facing execution environment receives source editing, real `.git`, unrestricted network, Docker control, and long-lived credentials together.

## Gate and fail closed

A **gate** verifies conditions before work. Software Engineer verifies Linux/workspace. GitHub Operator verifies repository and App authorization. **Fail closed** means stop on missing or ambiguous proof rather than guessing.

## CI/CD

Continuous Integration runs automated validation. Continuous Delivery packages validated artifacts/releases. Agents may trigger or inspect CI, but GitHub Actions records the authoritative result.

## Quantization and offload

Quantization stores model weights/caches with fewer bits to reduce memory. GPU offload controls how much runs on GPU. These deployment settings are not weight fine-tuning.

Next: [Ground-up build map](ground-up-build.md).

