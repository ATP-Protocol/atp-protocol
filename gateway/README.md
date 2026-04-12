# @atp-protocol/gateway

Reference ATP gateway — governed execution middleware for MCP tools on [DUAL](https://dual.network).

This is the reference implementation of the ATP gateway as specified in the [ATP Protocol Specification](../spec/ATP-SPEC-v1.md).

## Install

```bash
npm install @atp-protocol/gateway
```

## What it does

The gateway mediates the full governed execution pipeline:

1. **Authority check** — Verify wallet-org-role binding and authority grant
2. **Policy evaluation** — Enforce scope constraints (enumerations, numeric bounds, deny lists, etc.)
3. **Approval gate** — Route to approvers, handle timeout and escalation
4. **Credential brokerage** — Resolve and inject credentials without agent exposure
5. **Execution mediation** — Dispatch to downstream tools, classify outcomes
6. **Evidence capture** — Record complete evidence with hashes and timestamps

## Quick start

```typescript
import { ATPGateway } from "@atp-protocol/gateway";

const gateway = new ATPGateway({ gateway_id: "gw_prod_01" });

// Register a contract
gateway.contracts.register("ctr_email", {
  version: "1.0.0",
  authority: "org.procurement.send-email",
  actions: ["send-email"],
  scope: { recipient_domain: ["@approved-vendors.com"] },
  credentials: { provider: "gmail-api", scope: ["send"], inject_as: "oauth_token", fail_closed: true },
  attestation: "full",
});

// Bind wallet to org with authority
gateway.authority.bind("0xAgent", {
  org_id: "org_procurement",
  role: "procurement_agent",
  authorities: ["org.procurement.send-email"],
});

// Store credentials (gateway holds these, agents never see them)
gateway.credentials.store("gmail", {
  provider: "gmail-api",
  credential_type: "oauth_token",
  scope: ["send"],
  value: "ya29.actual-oauth-token",
  org_id: "org_procurement",
});

// Register tool handler
gateway.registerTool("send-email", "ctr_email", async (params, injectedHeaders) => {
  // injectedHeaders contains the OAuth token — agent never sees it
  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { ...injectedHeaders, "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  return { status: response.status, body: await response.json() };
});

// Execute governed action
const result = await gateway.execute({
  contract_id: "ctr_email",
  action: "send-email",
  params: { to: "vendor@approved-vendors.com", subject: "PO-001" },
  wallet: "0xAgent",
});

console.log(result.outcome);     // "outcome:success"
console.log(result.evidence_id); // "evi_abc123..."
```

## Conformance

This reference gateway implements **ATP-Verified** conformance:

- Authority checks with wallet-org-role binding
- Policy evaluation with 6 constraint types
- Approval state machine with pending/approve/deny
- Credential brokerage with fail-closed behavior
- 6 outcome types (success, failure, denied, timeout, partial, unknown)
- Idempotency enforcement (gateway-enforced)
- Evidence capture for all executions including denials
- Revocation with immediate propagation

## Deep imports

Individual middleware and stores are available for custom gateway implementations:

```typescript
import { checkAuthority } from "@atp-protocol/gateway/middleware";
import { evaluatePolicy } from "@atp-protocol/gateway/middleware";
import { ContractStore, AuthorityStore } from "@atp-protocol/gateway/store";
```

## Types

```typescript
import type {
  ExecutionRequest,
  ExecutionResponse,
  ExecutionOutcome,
  EvidenceRecord,
  GatewayConfig,
  WalletBinding,
  StoredCredential,
} from "@atp-protocol/gateway";
```

## Protocol spec

This gateway implements the [ATP Protocol Specification v1.0.0-draft.2](https://github.com/ATP-Protocol/atp-protocol/blob/main/spec/ATP-SPEC-v1.md), Sections 5-11.

## License

Apache 2.0
