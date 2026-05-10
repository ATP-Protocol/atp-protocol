---
sidebar_position: 6
---

# MCP Install Path

ATP ships an MCP server so agent clients can use ATP governance without embedding the gateway directly.

## Install from npm

After the first package release:

```bash
npm install -g @atp-protocol/mcp-server
```

Then configure an MCP client:

```json
{
  "mcpServers": {
    "atp": {
      "command": "npx",
      "args": ["@atp-protocol/mcp-server"]
    }
  }
}
```

## Run from source

```bash
cd mcp-server
npm install
npm run build
node dist/index.js
```

## Listing draft

The repo includes a marketplace-ready listing draft at `mcp-server/marketplace-listing.json`.

Minimum listing claims:

- package: `@atp-protocol/mcp-server`;
- command: `npx @atp-protocol/mcp-server`;
- purpose: govern agent actions with ATP contracts, policies, approvals, credentials, and evidence;
- tools: validation, policy evaluation, governed execution, authority binding, credential storage, evidence lookup, approval workflow, and gateway status;
- production note: reference server is suitable for evaluation; production deployments should replace in-memory stores and credential handling with managed infrastructure.

## Acceptance check

Before submitting to a marketplace or registry:

- npm package is published and installable;
- `npx @atp-protocol/mcp-server` starts on stdio;
- README includes client configuration examples;
- tool names match the package implementation;
- security note explains credential-store limitations;
- proof demo and conformance report are linked from the listing.
