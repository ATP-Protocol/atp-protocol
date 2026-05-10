---
sidebar_position: 2
---

# TypeScript SDK

`@atp-protocol/sdk` provides governed execution primitives for TypeScript and Node.

## Install

When published:

```bash
npm install @atp-protocol/sdk
```

For repo-local development:

```bash
cd sdk/ts
npm install
npm run build
npm test
```

## Govern a tool

```typescript
import { atpGovern } from "@atp-protocol/sdk";

const contract = {
  version: "1.0.0",
  authority: "org.procurement.send-email",
  actions: ["send-email"],
  attestation: "full",
  approval: {
    required: true,
    approver_role: "procurement_manager",
    timeout: "PT4H",
  },
  credentials: {
    provider: "gmail-api",
    scope: ["mail.send"],
    inject_as: "oauth_token",
    fail_closed: true,
  },
};

const governedSendEmail = atpGovern(
  {
    contract,
    gateway: "local",
    onDenied: async (reason) => {
      console.log("Denied:", reason);
    },
  },
  async (input: { to: string; subject: string; body: string }) => {
    return { status: "sent", to: input.to };
  }
);
```

## Validate a contract

```typescript
import { validateContract } from "@atp-protocol/sdk";

const result = validateContract(contract);

if (!result.valid) {
  console.error(result.errors);
}
```

## Evaluate policy locally

```typescript
import { evaluatePolicy } from "@atp-protocol/sdk";

const decision = evaluatePolicy(
  {
    ...contract,
    scope: {
      recipient_domain: ["@approved-vendors.com", "@internal.company.com"],
      max_attachments: 3,
      prohibited_content: ["wire transfer"],
    },
  },
  {
    recipient_domain: "ops@approved-vendors.com",
    max_attachments: 1,
  }
);

console.log(decision.permitted);
```

## Approval state machine

```typescript
import { ApprovalFlow } from "@atp-protocol/sdk";

const flow = new ApprovalFlow(
  "ctr_procurement_email",
  "send-email",
  { recipient: "vendor@approved-vendors.com" },
  "0xAgentWallet"
);

flow.transition("deliver");
flow.transition("approve");

if (flow.isApproved()) {
  const record = flow.toRecord("0xApproverWallet", "procurement_manager");
  console.log(record.approval_id);
}
```

## Evidence backend

```typescript
import { MemoryEvidenceBackend, buildEvidence } from "@atp-protocol/sdk";

const backend = new MemoryEvidenceBackend();
const evidence = buildEvidence({
  contract_id: "ctr_001",
  execution_id: "exe_001",
  authority: "org.procurement.send-email",
  requesting_wallet: "0xAgentWallet",
  requesting_org: "org_acme",
  action: "send-email",
  scope_snapshot: { to: "ops@approved-vendors.com" },
  credential_path: {
    provider: "gmail-api",
    scope_used: ["mail.send"],
    injection_method: "oauth_token",
  },
  outcome: "outcome:success",
  request_payload: { to: "ops@approved-vendors.com" },
  response_payload: { status: "sent" },
  attestation_level: "full",
  gateway_id: "gw_local",
  policy_snapshot: {
    policies_evaluated: 2,
    constraints_applied: [],
  },
});

await backend.store(evidence);
```

## Main exports

| Export | Purpose |
|--------|---------|
| `atpGovern` | Wrap a tool handler with ATP governance |
| `validateContract` | Validate ATP contract structure |
| `evaluatePolicy` | Evaluate request params against contract scope |
| `ApprovalFlow` | Run approval state transitions |
| `CredentialStore` | Store and resolve scoped credentials |
| `MemoryEvidenceBackend` | In-memory evidence backend for tests and demos |
| `FileEvidenceBackend` | File-based evidence backend |
| `execute` | Managed execution helper |

## Conformance

The TypeScript SDK covers local ATP-Aware and ATP-Compatible primitives. Use the reference gateway plus evidence backend for ATP-Verified and ATP-Attested proof.
