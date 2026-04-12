# ATP Quickstart Example

This directory contains a runnable example of the ATP protocol in action.

## Running the Example

```bash
cd atp-protocol
npx tsx examples/quickstart.ts
```

The example demonstrates:
1. **Contract Definition** — Define an ATP contract with scope constraints
2. **Validation** — Validate contracts before use
3. **Credential Brokerage** — Store and manage credentials securely
4. **Evidence Recording** — Capture all executions (permitted and denied)
5. **Tool Wrapping** — Govern a tool with ATP policies
6. **Policy Evaluation** — Check requests against contract constraints
7. **Query Evidence** — Inspect the audit trail

## What It Shows

- An email-send tool with rate limiting and domain-allowlist policies
- Both a permitted request (alice@acme.com) and a denied request (bob@untrusted-domain.com)
- How evidence is recorded and queryable
- The ATP governance flow end-to-end in ~150 lines
