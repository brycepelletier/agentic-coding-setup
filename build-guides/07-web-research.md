# Stage 7 — Add Bounded Research

## Goal

Retrieve current public technical documentation without a general browser, host network shell, or credential access.

## Install

Configure `@brycepelletier/web-research-mcp@0.1.0` using the [MCP template](../templates.md#vs-code-mcp-configuration). `web_search` uses DuckDuckGo with Bing RSS fallback; `fetch_page` applies URL/download/output limits.

## Verify

Search for Node.js documentation restricted to `nodejs.org`, limit 3. Fetch the filesystem page with `find=readFile`, maximum 2,000 characters. Require limit 11, loopback, private-network, and credential-bearing URLs to fail. Confirm fallback errors/results are sanitized.

## Stop/go

Continue only when useful public research works and local/private targets fail.

Next: [Agents](08-agents.md).

