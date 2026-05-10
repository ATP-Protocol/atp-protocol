# ATP Examples

This directory contains runnable examples of ATP in action.

## Fastest proof

```bash
cd examples/mcp-demo
npm install
npm run demo
```

This is the recommended evaluator path. It runs six governed MCP scenarios across email, inventory, and payment tools and prints the authority, policy, approval, credential, execution, and evidence steps.

## SDK quickstart

From the repo root:

```bash
cd sdk/ts
npm install
npm run build
cd ../..
npx tsx examples/quickstart.ts
```

The quickstart demonstrates:

1. **Contract Definition** — Define an ATP contract with scope constraints
2. **Validation** — Validate contracts before use
3. **Credential Brokerage** — Store and manage credentials securely
4. **Evidence Recording** — Capture all executions (permitted and denied)
5. **Tool Wrapping** — Govern a tool with ATP policies
6. **Policy Evaluation** — Check requests against contract constraints
7. **Query Evidence** — Inspect the audit trail

## Example catalog

| Example | Path | Purpose |
|---------|------|---------|
| MCP governance demo | `mcp-demo/` | End-to-end policy, approval, credential, execution, and evidence proof |
| SDK quickstart | `quickstart.ts` | Small TypeScript SDK walkthrough |
| Contract examples | `contracts/` | Minimal reusable ATP contracts |
| Agent trust demo | `agent-trust-demo/` | Optional attestation-backed agent trust scenario |
| Live backend demo | `live-dual-demo/` | Optional live external-backend integration path |

## What the quickstart shows

- An email-send tool with rate limiting and domain-allowlist policies
- Both a permitted request (alice@acme.com) and a denied request (bob@untrusted-domain.com)
- How evidence is recorded and queryable
- The ATP governance flow end-to-end in ~150 lines
