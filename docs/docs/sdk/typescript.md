---
sidebar_position: 2
---

# TypeScript SDK

Complete API reference for `@atp-protocol/sdk`.

## Installation

```bash
npm install @atp-protocol/sdk
```

## Initialization

```typescript
import { ATP } from '@atp-protocol/sdk';

const atp = new ATP({
  gatewayUrl: 'http://localhost:8080',
  walletPrivateKey: process.env.AGENT_WALLET_KEY,
  organization: 'com.acme',
  credentialsBrokerUrl: 'http://localhost:8081',
  evidenceAnchoring: {
    enabled: true,
    blockchainRpc: 'https://mainnet.infura.io/v3/YOUR-PROJECT-ID'
  }
});
```

## Core Classes

### ATP

Main client for interacting with the protocol.

#### Properties

```typescript
atp.actions      // ActionAPI
atp.contracts    // ContractAPI
atp.authority    // AuthorityAPI
atp.evidence     // EvidenceAPI
atp.audit        // AuditAPI
atp.credentials  // CredentialAPI
atp.blockchain   // BlockchainAPI
atp.wallet       // Wallet instance
```

#### Methods

```typescript
// Get gateway status
const status = await atp.health.check();
// Returns: { status: 'healthy', version: '1.0.0', ... }

// Get wallet info
const wallet = atp.getWallet();
// Returns: { id: 'atp://com.acme/agent-001', publicKey: '...', ... }
```

### ActionAPI

Manage action proposal and execution.

```typescript
// Propose an action
const action = await atp.actions.propose({
  type: 'user.delete',
  target: { userId: '12345' },
  metadata: {
    reason: 'User requested account deletion',
    timestamp: new Date().toISOString()
  }
});
// Returns: Action object with status 'proposed'

// Get action status
const action = await atp.actions.get('action-12345');
// Returns: Action object with current status

// Wait for approval with timeout
const approved = await atp.actions.waitForApproval('action-12345', {
  timeout: 5 * 60 * 1000  // 5 minutes
});
// Returns: Action object with status 'approved' or 'rejected'

// Execute approved action
const result = await atp.actions.execute('action-12345');
// Returns: Action object with status 'executing' then 'attested'

// List actions
const actions = await atp.actions.list({
  status: 'approved',
  signer: 'agent-001',
  limit: 20
});
// Returns: Paginated list of actions

// Cancel a proposed action
await atp.actions.cancel('action-12345', {
  reason: 'No longer needed'
});
```

### ContractAPI

Manage execution contracts.

```typescript
// Load from JSON
const contract = Contract.from(require('./contract.json'));

// Validate
const validation = contract.validate();
// Returns: { valid: true/false, errors: [] }

// Sign with multiple signers
const signed = await contract.sign([
  { signer: 'alice@acme.com', privateKey: aliceKey },
  { signer: 'bob@acme.com', privateKey: bobKey }
]);
// Returns: Signed contract with signatures array

// Register contract with ATP
await atp.contracts.register(signed);

// Get contract
const contract = await atp.contracts.get('contract-user-deletion-v1');

// List contracts
const contracts = await atp.contracts.list({
  organization: 'com.acme',
  limit: 50
});

// Find matching contract for action
const contracts = await atp.contracts.findMatching({
  action_type: 'user.delete'
});
```

### AuthorityAPI

Manage authority and delegations.

```typescript
// Get wallet's authority
const wallet = await atp.authority.wallet('atp://com.acme/alice-cso');
// Returns: { id: '...', authority: 'full', scoped_actions: [] }

// Create delegation
const delegation = new Delegation({
  delegator: 'atp://com.acme/alice-cso',
  delegatee: 'atp://com.acme/bob-eng',
  scope: {
    actions: ['user.delete', 'database.backup'],
    environments: ['staging', 'development']
  },
  validity: {
    not_before: new Date(),
    not_after: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
  }
});

// Sign delegation
const signed = await delegation.sign([aliceKey]);

// Publish delegation
await atp.delegations.publish(signed);

// Verify authority
const canApprove = await atp.authority.verify({
  approver: 'atp://com.acme/bob-eng',
  action_type: 'user.delete',
  environment: 'staging',
  timestamp: new Date()
});
// Returns: { valid: true/false, reason: '...' }

// Revoke delegation
await atp.delegations.revoke('delegation-id', {
  reason: 'Employee termination'
});

// List delegations
const delegations = await atp.delegations.list({
  delegatee: 'atp://com.acme/bob-eng'
});
```

### EvidenceAPI

Generate and manage evidence.

```typescript
// Generate evidence after execution
const evidence = await atp.evidence.generate({
  action_id: 'action-12345',
  outcome: 'success',
  result: { user_id: '12345', deleted_at: '2026-03-15T14:35:00Z' },
  timestamp: new Date(),
  execution_time_ms: 245
});

// Record evidence in audit log
await atp.evidence.record(evidence);

// Get evidence by action
const evidence = await atp.evidence.get('action-12345');

// Query evidence
const logs = await atp.evidence.query({
  signer: 'agent-001',
  start_time: '2026-03-01T00:00:00Z',
  end_time: '2026-03-31T23:59:59Z',
  limit: 100
});
```

### BlockchainAPI

Anchor evidence to blockchain.

```typescript
// Anchor evidence to Ethereum
const anchored = await atp.blockchain.anchor(evidence, {
  chain: 'ethereum',
  gas_limit: 50000
});
// Returns: { tx_hash: '0x...', block: 12345678, ... }

// Verify anchored evidence
const isValid = await atp.blockchain.verify({
  chain: 'ethereum',
  tx_hash: '0xdeadbeef...',
  evidence_hash: 'sha256:abc123...'
});
// Returns: true/false

// Get anchor status
const status = await atp.blockchain.anchorStatus('0xdeadbeef...');
// Returns: { status: 'pending'|'confirmed'|'finalized', ... }
```

### AuditAPI

Query audit trail.

```typescript
// List audit entries
const entries = await atp.audit.list({
  start_time: '2026-03-01T00:00:00Z',
  end_time: '2026-03-31T23:59:59Z',
  limit: 1000
});

// Query by signer
const entries = await atp.audit.query({
  signer: 'agent-001'
});

// Query by action type
const entries = await atp.audit.query({
  action_type: 'user.delete'
});

// Query by outcome
const failures = await atp.audit.query({
  outcome: 'failure'
});

// Export audit log as CSV
const csv = await atp.audit.export({
  format: 'csv',
  start_time: '2026-03-01T00:00:00Z',
  end_time: '2026-03-31T23:59:59Z'
});
```

### CredentialAPI

Request credentials.

```typescript
// Get credential (normally injected automatically)
const cred = await atp.credentials.get({
  action_id: 'action-12345',
  credential_key: 'database',
  injection_method: 'unix_socket'
});

// Revoke credential early
await atp.credentials.revoke('cred-id');

// Get credential audit logs
const logs = await atp.credentials.auditLogs({
  credential_key: 'database',
  start_time: '2026-03-01T00:00:00Z'
});
```

## Deep Imports

If you only need parts of the SDK:

```typescript
// Just actions
import { ATP } from '@atp-protocol/sdk/actions';

// Just contracts
import { Contract } from '@atp-protocol/sdk/contracts';

// Just authority
import { Authority, Delegation } from '@atp-protocol/sdk/authority';

// Testing
import { MockATP } from '@atp-protocol/sdk/testing';
```

## Error Classes

```typescript
// Policy constraint failed
class PolicyEvaluationError extends ATPError {
  constraint: string;
  operator: string;
  expected: any;
  actual: any;
}

// Required approval not received
class ApprovalTimeoutError extends ATPError {
  action_id: string;
  timeout_ms: number;
}

// Credential injection failed
class CredentialError extends ATPError {
  credential_key: string;
  injection_method: string;
  vault_error: string;
}

// Contract validation failed
class ContractValidationError extends ATPError {
  errors: Array<{field: string, message: string}>;
}

// Network/gateway error
class GatewayError extends ATPError {
  status_code: number;
  response_body: string;
}
```

## Testing

```typescript
import { MockATP } from '@atp-protocol/sdk/testing';
import { assert } from 'chai';

describe('User Deletion', () => {
  let atp: MockATP;

  beforeEach(() => {
    atp = new MockATP();
  });

  it('should delete user', async () => {
    const action = await atp.actions.propose({
      type: 'user.delete',
      target: { userId: '12345' }
    });

    // Mock ATP auto-approves
    const approved = await atp.actions.waitForApproval(action.id);
    assert.equal(approved.status, 'approved');

    // Execute
    const result = await atp.actions.execute(action.id);
    assert.equal(result.outcome, 'success');
  });

  it('should reject if not approved', async () => {
    atp.setAutoApprove(false);

    const action = await atp.actions.propose({
      type: 'user.delete',
      target: { userId: '12345' }
    });

    try {
      await atp.actions.waitForApproval(action.id, { timeout: 100 });
      assert.fail('Should have timed out');
    } catch (error) {
      assert(error instanceof ApprovalTimeoutError);
    }
  });
});
```

## Examples

### Complete Workflow

```typescript
import { ATP, Contract } from '@atp-protocol/sdk';

const atp = new ATP({
  gatewayUrl: 'http://localhost:8080',
  walletPrivateKey: process.env.AGENT_WALLET_KEY
});

// 1. Load contract
const contract = Contract.from(require('./contract.json'));
const validation = contract.validate();
if (!validation.valid) {
  throw new Error(`Contract invalid: ${validation.errors}`);
}

// 2. Propose action
const action = await atp.actions.propose({
  type: 'user.delete',
  target: { userId: '12345' },
  metadata: { reason: 'User requested deletion' }
});
console.log(`Action proposed: ${action.id}`);

// 3. Wait for approval
const approved = await atp.actions.waitForApproval(action.id, {
  timeout: 5 * 60 * 1000
});

if (approved.status !== 'approved') {
  console.error(`Action rejected: ${approved.status}`);
  process.exit(1);
}
console.log('Action approved!');

// 4. Execute action
const executed = await atp.actions.execute(action.id);
console.log(`Execution outcome: ${executed.outcome}`);

// 5. Check evidence
if (executed.status === 'attested') {
  const evidence = await atp.evidence.get(action.id);
  console.log(`Evidence ID: ${evidence.evidence_id}`);
  console.log(`Signer: ${evidence.signer_wallet}`);
  console.log(`Approvers: ${evidence.approvers.join(', ')}`);
  
  // Optionally anchor to blockchain
  if (evidence.blockchain_anchor) {
    console.log(`Anchored to ${evidence.blockchain_anchor.chain}`);
  }
}
```

## Next Steps

- [Python SDK](./python.md) — Python implementation
- [Quick Start](../quick-start.md) — 5-minute setup
- [Specification](../spec/overview.md) — Full protocol specification
