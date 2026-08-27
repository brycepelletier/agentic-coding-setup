# Host and Workspace Layout

## Current observed locations

```text
T:\repos\environment-controller
T:\repos\agent-env-mcp
T:\repos\github-app-mcp
T:\repos\docker-app-mcp
T:\repos\web-research-mcp
T:\repos\githooks
D:\mcp\github-token-broker        # retired implementation
D:\large-language-models          # LM Studio download directory
```

VS Code user configuration:

```text
%APPDATA%\Code\User\settings.json
%APPDATA%\Code\User\chatLanguageModels.json
%APPDATA%\Code\User\mcp.json
%APPDATA%\Code\User\prompts\software-engineer.agent.md
%APPDATA%\Code\User\prompts\github-operator.agent.md
%APPDATA%\Code\User\prompts\docker-operator.agent.md
%APPDATA%\Code\User\prompts\web-search.agent.md
```

LM Studio configuration:

```text
%USERPROFILE%\.lmstudio\.internal\http-server-config.json
%USERPROFILE%\.lmstudio\apps\bionic\settings.json
%USERPROFILE%\.lmstudio\apps\bionic\.internal\settings.json
%USERPROFILE%\.lmstudio\apps\bionic\.internal\user-concrete-model-default-config\...
```

## Portability rules

- Treat drive letters and usernames as machine-specific.
- Keep the GitHub App PEM outside repositories.
- Do not copy LM Studio internal databases or identity/key files to documentation or source control.
- Recreate public configuration from templates; let LM Studio regenerate internal state.
- Application repositories do not own the reusable agent runtime.
