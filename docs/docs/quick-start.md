---
sidebar_position: 2
---

# Quick Start

Get ATP up and running in 5 minutes. This guide walks you through installing the SDK, creating your first contract, and governing an MCP tool.

## Step 1: Install the SDK

```bash
npm install @atp-protocol/sdk
```

Or with yarn:

```bash
yarn add @atp-protocol/sdk
```

Python support is also available:

```bash
pip install atp-protocol
```

## Step 2: Create Your First Contract

A contract is a JSON document that tells ATP what actions are allowed and under what conditions. Here's a minimal example:

```json
{
  "version": "1.0.0",
  "id": "contract-delete-user-v1",
  "organization": "acme-corp",
  "title": "Delete User Contract",
  "description": "Allows agents to delete staging-only users",
  "actions": [
    {
      "type": "user.delete",
      "description": "Delete a user account",
      "constraints": [
        {
          "type": "environment",
          "value": "staging",
          "operator": "eq"
        },
        {
          "type": "rate_limit",
          "value": 100,
          "window": "1h",
          "operator": "lte"
        }
      ]
    }
  ],
  "approval_flow": {
    "required_signers": 2,
    "signers": ["alice@acme.com", "bob@acme.com"]
  },
  "validity": {
    "not_before": "2026-01-01T00:00:00Z",
    "not_after": "2026-12-31T23:59:59Z"
  }
}
```

**What this contract says:**
- Agents can delete users, but only in the staging environment
- Maximum 100 deletions per hour
- Two authorized people (Alice and Bob) must sign off on the contract
- The contract is valid for all of 2026

## Step 3: Validate the Contract

Use the SDK to validate your contract syntax:

```javascript
import { Contract } from '@atp-protocol/sdk';

const contractJson = require('./contracts/delete-user.json');
const contract = Contract.from(contractJson);

// Validate syntax, field completeness, and constraint logic
const result = contract.validate();
if (!result.valid) {
  console.error('Contract validation failed:', result.errors);
} else {
  console.log('Contract is valid and ready to sign');
}
```

## Step 4: Govern an MCP Tool

Now let's apply the contract to an MCP (Model Context Protocol) tool. Here's how to protect a user deletion endpoint:

```javascript
import { ATP, Contract, Face } from '@atp-protocol/sdk';

// Initialize ATP with your gateway endpoint
const atp = new ATP({
  gatewayUrl: 'http://localhost:8080',
  walletPrivateKey: process.env.AGENT_WALLET_KEY,
});

// Load and sign the contract with authorized signers
const contract = Contract.from(require('./contracts/delete-user.json'));
const signedContract = await contract.sign([
  { signer: 'alice@acme.com', key: aliceKey },
  { signer: 'bob@acme.com', key: bobKey },
]);

// Create a Face (agent deployment identifier)
const face = new Face({
  name: 'user-deletion-service-prod',
  wallet: atp.wallet,
  environment: 'production',
  contracts: [signedContract],
});

// Register the face with ATP
const registeredFace = await atp.faces.register(face);

// Now, when the agent wants to delete a user, it proposes an action:
const action = await atp.actions.propose({
  type: 'user.delete',
  target: { userId: '12345' },
  metadata: {
    reason: 'User requested account deletion',
    timestamp: new Date().toISOString(),
  },
});

// ATP evaluates the action against the contract
console.log(`Action ${action.id} proposed. Status: ${action.status}`);

// Wait for the action to be approved (or escalated)
const approvedAction = await atp.actions.waitForApproval(action.id, {
  timeout: 5 * 60 * 1000, // 5 minutes
});

if (approvedAction.status === 'approved') {
  // Safe to execute: ATP has validated that this action is allowed
  console.log('Action approved by required signers');
  
  // Execute the action
  const result = await userDatabase.deleteUser('12345');
  
  // Generate and sign evidence
  const evidence = await atp.evidence.generate({
    actionId: action.id,
    outcome: 'success',
    result: result,
    timestamp: new Date().toISOString(),
  });
  
  // Record the evidence for audit
  await atp.evidence.record(evidence);
} else if (approvedAction.status === 'escalated') {
  console.log('Action requires human review. Waiting for approval...');
} else if (approvedAction.status === 'rejected') {
  throw new Error(`Action rejected: ${approvedAction.reason}`);
}
```

## Step 5: Run the Conformance Suite

ATP includes a conformance test suite to validate your implementation:

```bash
npm run conformance -- --level=basic
```

This runs tests against four conformance levels:
- **Basic:** Contract validation, action proposal, evidence recording
- **Standard:** Approval flows, delegation chains, policy evaluation
- **Advanced:** Cross-organization federation, credential brokerage, rate limiting
- **Certified:** Full spec compliance with production-grade audit trails

## What Happens Behind the Scenes

When you propose an action, ATP runs through an 8-step pipeline:

1. **Intake:** Validate action format and required fields
2. **Lookup:** Find the contract that governs this action type
3. **Evaluation:** Check all constraints (time, environment, rate limits, delegations)
4. **Approval:** Wait for required signers to approve
5. **Execution:** Run the action and capture the result
6. **Evidence:** Generate signed evidence of what happened
7. **Recording:** Store evidence in audit log and (optionally) external attestation backend
8. **Notification:** Notify stakeholders (agent, approvers, audit team)

If any step fails, the action is rejected and logged. The agent never gets to execute without passing all gates.

## Configuration

ATP reads configuration from environment variables or a config file:

```bash
# .env
ATP_GATEWAY_URL=http://localhost:8080
ATP_WALLET_KEY=<your-agent-wallet-private-key>
ATP_ORGANIZATION=acme-corp
ATP_FACE_NAME=user-deletion-service-prod
ATP_CREDENTIALS_BROKER_URL=http://localhost:8081
ATP_EVIDENCE_ATTESTATION_ENABLED=true
```

Or in code:

```javascript
const atp = new ATP({
  gatewayUrl: process.env.ATP_GATEWAY_URL,
  walletPrivateKey: process.env.ATP_WALLET_KEY,
  organization: process.env.ATP_ORGANIZATION,
  credentialsBrokerUrl: process.env.ATP_CREDENTIALS_BROKER_URL,
  evidenceAttestation: {
    enabled: true,
    backendUrl: 'https://attestation.example.com',
  },
});
```

## Next Steps

- **[Specification Overview](./spec/overview.md)** — Understand all 14 sections of the ATP spec
- **[Contracts Reference](./spec/contracts.md)** — Learn the full contract JSON schema
- **[Authority Model](./spec/authority.md)** — Set up delegation chains and cross-org federation
- **[Policy Evaluation](./spec/policy.md)** — Master the 8 constraint types
- **[Approval State Machine](./spec/approval.md)** — Design approval workflows
- **[SDK Reference](./sdk/typescript.md)** — Deep dive into the TypeScript SDK API
- **[Gateway Deployment](./gateway/overview.md)** — Run ATP in your infrastructure
- **[Conformance Testing](./conformance/overview.md)** — Get certified

## Troubleshooting

**Q: "Contract validation failed: invalid constraint type"**
A: Check the constraint `type` field. Valid types are: `environment`, `rate_limit`, `time_of_day`, `delegation`, `categorical`, `quota`. See [Policy Evaluation](./spec/policy.md) for details.

**Q: "Action timed out waiting for approval"**
A: Approvers may not have received the notification. Check that the approval notification service is running and that approver email addresses are correct in the contract.

**Q: "Evidence recording failed"**
A: The audit log service may be down. Check that the gateway is running and configured with a valid database connection.

**Q: How do I test this locally without a running gateway?**
A: Use the mock ATP implementation:

```javascript
import { MockATP } from '@atp-protocol/sdk/testing';

const atp = new MockATP(); // In-memory implementation for testing
```

This is perfect for integration tests and local development.
