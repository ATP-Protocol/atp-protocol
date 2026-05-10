---
sidebar_position: 2
---

# Quick Start

Get ATP running locally, then wrap one tool with governance.

## 1. Run the proof demo

From a fresh checkout:

```bash
git clone https://github.com/ATP-Protocol/atp-protocol.git
cd atp-protocol/examples/mcp-demo
npm install
npm run demo
```

Expected result: six governed MCP scenarios print to the terminal. You should see successful executions, policy denials, and a pending approval path. No external API keys are required.

## 2. Install the SDK

When packages are published:

```bash
npm install @atp-protocol/sdk
```

Until then, use the repo-local SDK:

```bash
cd sdk/ts
npm install
npm run build
```

## 3. Define a contract

```typescript
import type { ATPContract } from "@atp-protocol/sdk";

const contract: ATPContract = {
  version: "1.0.0",
  authority: "org.procurement.send-email",
  actions: ["send-email"],
  attestation: "full",
  scope: {
    recipient_domain: ["@approved-vendors.com", "@internal.company.com"],
    max_attachments: 3,
    prohibited_content: ["wire transfer", "payment routing"],
  },
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
```

## 4. Validate and evaluate locally

```typescript
import { evaluatePolicy, validateContract } from "@atp-protocol/sdk";

const validation = validateContract(contract);
if (!validation.valid) {
  throw new Error(validation.errors.map((e) => e.message).join(", "));
}

const decision = evaluatePolicy(contract, {
  recipient_domain: "ops@approved-vendors.com",
  max_attachments: 1,
});

if (!decision.permitted) {
  console.error(decision.denial_reason);
}
```

## 5. Govern a tool

```typescript
import { atpGovern } from "@atp-protocol/sdk";

async function sendEmail(input: { to: string; subject: string; body: string }) {
  return {
    status: "sent",
    message_id: "msg_demo_001",
    to: input.to,
  };
}

const governedSendEmail = atpGovern(
  {
    contract,
    gateway: "local",
    onDenied: async (reason) => {
      console.log("ATP denied execution:", reason);
    },
  },
  sendEmail
);

const result = await governedSendEmail({
  to: "ops@approved-vendors.com",
  subject: "Purchase order",
  body: "Please process PO-2026-001.",
});

console.log(result.outcome, result.execution_id);
```

## 6. Prove the integration

For a credible first evaluation:

1. Run `examples/mcp-demo` and keep the terminal output.
2. Add one real MCP tool behind `atpGovern`.
3. Show one permitted action, one policy denial, and one approval-required action.
4. Record the evidence IDs for each scenario.
5. Run the conformance suite at the highest level your gateway supports.

## Next Steps

- [5-minute proof demo](./proof-demo.md)
- [Conformance testing](./conformance/overview.md)
- [Adoption paths](./adoption-paths.md)
- [Release readiness](./release-readiness.md)
