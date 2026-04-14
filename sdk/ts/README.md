# @atp-protocol/sdk

TypeScript SDK for the [Agent Trust Protocol (ATP)](https://github.com/ATP-Protocol/atp-protocol) — governed execution for AI agents with pluggable attestation backends.

Govern AI agent execution with authority checks, policy evaluation, approval flows, credential brokerage, and evidence capture.

One import. One wrapper. The agent keeps calling the tool exactly as before — but now authority is checked, policy is enforced, approvals are gated, credentials are brokered, and evidence is recorded.

## Install

```bash
npm install @atp-protocol/sdk
```

## Quick start

### Govern an MCP tool

```typescript
import { atpGovern } from "@atp-protocol/sdk";

// Wrap any MCP tool handler with ATP governance
server.tool("send-email", atpGovern({
  contract: {
    version: "1.0.0",
    authority: "org.procurement.send-email",
    actions: ["send-email"],
    attestation: "full",
    approval: {
      required: true,
      approver_role: "procurement_manager",
      timeout: "PT4H",
      escalation_path: "department_head,cfo"
    },
    credentials: {
      provider: "gmail-api",
      scope: ["send"],
      inject_as: "oauth_token",
      fail_closed: true
    }
  },
  gateway: "https://gateway.your-org.com"
}, sendEmailHandler));
```

### Validate a contract

```typescript
import { validateContract } from "@atp-protocol/sdk";

const result = validateContract({
  version: "1.0.0",
  authority: "org.finance.approve-payment",
  actions: ["approve-payment"],
  attestation: "full"
});

if (!result.valid) {
  console.error("Errors:", result.errors);
}
if (result.warnings.length > 0) {
  console.warn("Warnings:", result.warnings);
}
```

### Evaluate policy locally

```typescript
import { evaluatePolicy } from "@atp-protocol/sdk";

const contract = {
  version: "1.0.0",
  authority: "org.procurement.send-email",
  actions: ["send-email"],
  attestation: "full",
  scope: {
    recipient_domain: ["@approved-vendors.com", "@internal.company.com"],
    max_attachments: 3,
    prohibited_content: ["payment instructions", "wire transfer"]
  }
};

const result = evaluatePolicy(contract, {
  recipient_domain: "user@approved-vendors.com",
  max_attachments: 1
});

console.log(result.permitted);  // true
```

### Approval state machine

```typescript
import { ApprovalFlow } from "@atp-protocol/sdk";

const flow = new ApprovalFlow(
  "ctr_procurement_email",
  "send-email",
  { recipient: "vendor@approved-vendors.com" },
  "0xAgentWallet"
);

// Progress through the state machine
flow.transition("deliver");   // REQUESTED → PENDING_REVIEW
flow.transition("approve");   // PENDING_REVIEW → APPROVED

if (flow.isApproved()) {
  // Proceed to execution
  const record = flow.toRecord("0xApproverWallet", "procurement_manager");
}
```

### Load a contract from file

```typescript
import { loadContract } from "@atp-protocol/sdk";

const contract = await loadContract("contracts/procurement-email.json");
```

## API

### Governance

| Function | Description |
|----------|-------------|
| `atpGovern(options, handler)` | Wrap a tool handler with ATP governance |
| `createGovernedContext(options)` | Create a governed execution context for manual flow control |

### Contract

| Function | Description |
|----------|-------------|
| `validateContract(contract)` | Validate an ATP contract against the spec |
| `isContractExpired(contract)` | Check if a contract has expired |
| `requiresApproval(contract, amount?)` | Check if approval is required |
| `parseEscalationPath(contract)` | Parse escalation path into role list |
| `loadContract(path)` | Load and validate a contract from a JSON file |
| `loadContracts(dir)` | Load all contracts from a directory |

### Policy

| Function | Description |
|----------|-------------|
| `evaluatePolicy(contract, params)` | Evaluate request params against contract scope |
| `mergeConstraints(...policySets)` | Merge multiple policy sets (most restrictive wins) |

### Approval

| Class/Function | Description |
|----------------|-------------|
| `ApprovalFlow` | Approval state machine (9 states, deterministic transitions) |
| `canTransition(state, trigger)` | Check if a transition is valid |
| `validTriggers(state)` | Get all valid triggers for a state |

## Deep imports

Each module is available as a direct import for tree-shaking:

```typescript
import { validateContract } from "@atp-protocol/sdk/contract";
import { evaluatePolicy } from "@atp-protocol/sdk/policy";
import { ApprovalFlow } from "@atp-protocol/sdk/approval";
import { atpGovern } from "@atp-protocol/sdk/governance";
```

## Types

All ATP types are exported for TypeScript consumers:

```typescript
import type {
  ATPContract,
  ExecutionOutcome,
  ApprovalState,
  EvidenceRecord,
  PolicyEvaluation,
  GovernOptions,
  GovernedResult,
  ConformanceLevel,
} from "@atp-protocol/sdk";
```

## Conformance

This SDK enables **ATP-Aware** and **ATP-Compatible** conformance levels out of the box. For **ATP-Verified** and **ATP-Attested**, connect to an [ATP gateway](https://github.com/ATP-Protocol/atp-protocol/tree/main/gateway).

## Protocol spec

This SDK implements the [ATP Protocol Specification v1.0.0-draft.2](https://github.com/ATP-Protocol/atp-protocol/blob/main/spec/ATP-SPEC-v1.md).

## License

Apache 2.0
