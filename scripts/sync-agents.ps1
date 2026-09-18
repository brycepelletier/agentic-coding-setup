param(
    [ValidateSet('Check', 'Install', 'Import')]
    [string]$Mode = 'Check'
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$trackedDirectory = Join-Path $repositoryRoot 'agent-templates'
$activeDirectory = Join-Path $env:USERPROFILE '.agents'
$files = @(
    'AGENTS.md',
    'software-engineer.agent.md',
    'github-operator.agent.md',
    'docker-operator.agent.md',
    'web-search.agent.md'
)

if ($Mode -eq 'Install') {
    New-Item -ItemType Directory -Force -Path $activeDirectory | Out-Null
    foreach ($file in $files) {
        Copy-Item -LiteralPath (Join-Path $trackedDirectory $file) -Destination (Join-Path $activeDirectory $file) -Force
    }
}
elseif ($Mode -eq 'Import') {
    foreach ($file in $files) {
        $source = Join-Path $activeDirectory $file
        if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
            throw "Active definition is missing: $source"
        }
        Copy-Item -LiteralPath $source -Destination (Join-Path $trackedDirectory $file) -Force
    }
}

$different = @()
foreach ($file in $files) {
    $tracked = Join-Path $trackedDirectory $file
    $active = Join-Path $activeDirectory $file
    if (-not (Test-Path -LiteralPath $tracked -PathType Leaf) -or -not (Test-Path -LiteralPath $active -PathType Leaf)) {
        $different += $file
        continue
    }
    if ((Get-FileHash -Algorithm SHA256 -LiteralPath $tracked).Hash -ne (Get-FileHash -Algorithm SHA256 -LiteralPath $active).Hash) {
        $different += $file
    }
}

if ($different.Count -gt 0) {
    throw "Agent definitions are not synchronized: $($different -join ', ')"
}

$mcpConfiguration = Join-Path $env:APPDATA 'Code\User\mcp.json'
if (Test-Path -LiteralPath $mcpConfiguration) {
    $servers = (Get-Content -LiteralPath $mcpConfiguration -Raw | ConvertFrom-Json).servers.PSObject.Properties.Name
    foreach ($file in $files | Where-Object { $_ -like '*.agent.md' }) {
        $definition = Get-Content -LiteralPath (Join-Path $trackedDirectory $file) -Raw
        $frontmatter = [regex]::Match($definition, '(?s)^---\r?\n(.*?)\r?\n---').Groups[1].Value
        foreach ($match in [regex]::Matches($frontmatter, '(?m)^\s+-\s+[''" ]*([a-z][a-z0-9-]*)/')) {
            if ($match.Groups[1].Value -notin $servers) {
                throw "Agent $file references an unregistered MCP namespace: $($match.Groups[1].Value)"
            }
        }
    }
}
Write-Output "Agent definitions are synchronized ($($files.Count) files)."
