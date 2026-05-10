---
sidebar_position: 1
---

# SDK Overview

ATP provides TypeScript and Python SDKs for local governance primitives: contract validation, policy evaluation, approval state management, credential brokerage, execution helpers, and evidence records.

The TypeScript SDK also exposes `atpGovern`, a wrapper for governing MCP-style tool handlers.

## Packages

| Language | Package | Path |
|----------|---------|------|
| TypeScript | `@atp-protocol/sdk` | `sdk/ts/` |
| Python | `atp-protocol` | `sdk/python/` |

## TypeScript

```typescript
import {
  ApprovalFlow,
  atpGovern,
  evaluatePolicy,
  validateContract,
} from "@atp-protocol/sdk";

const contract = {
  version: "1.0.0",
  authority: "org.procurement.send-email",
  actions: ["send-email"],
  attestation: "full",
  scope: {
    recipient_domain: ["@approved-vendors.com"],
    max_attachments: 3,
  },
};

const validation = validateContract(contract);
const policy = evaluatePolicy(contract, {
  recipient_domain: "ops@approved-vendors.com",
  max_attachments: 1,
});

const flow = new ApprovalFlow("ctr_001", "send-email", {}, "0xAgent");
flow.transition("deliver");
flow.transition("approve");

const governedTool = atpGovern({ contract, gateway: "local" }, async (input) => {
  return { ok: true, input };
});
```

## Python

```python
from atp_protocol import ApprovalFlow, evaluate_policy, validate_contract

contract = {
    "version": "1.0.0",
    "authority": "org.finance.approve-payment",
    "actions": ["approve-payment"],
    "attestation": "full",
    "scope": {"max_amount": 5000},
}

validation = validate_contract(contract)
policy = evaluate_policy(contract, {"max_amount": 3000})

flow = ApprovalFlow("ctr_001", "approve-payment", {}, "0xAgent")
flow.transition("deliver")
flow.transition("approve")
```

## Which SDK should I start with?

- Use TypeScript when you are wrapping MCP tools or building a Node gateway.
- Use Python when you need local validation, policy evaluation, and approval state logic inside Python agent infrastructure.
- Use the conformance package when you are implementing a gateway and need a public test report.

## Next steps

- [TypeScript SDK](./typescript.md)
- [Python SDK](./python.md)
- [5-minute proof demo](../proof-demo.md)
- [Conformance testing](../conformance/overview.md)
