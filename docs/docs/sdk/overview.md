---
sidebar_position: 1
---

# SDK Overview

ATP provides SDKs in TypeScript and Python for integrating protocol governance into your agent code. Both SDKs offer identical functionality with language-appropriate APIs.

## Available SDKs

| Language | Package | Repository |
|----------|---------|------------|
| **TypeScript** | `@atp-protocol/sdk` | [atp-protocol-sdk-ts](https://github.com/ATP-Protocol/atp-protocol-sdk-ts) |
| **Python** | `atp-protocol` | [atp-protocol-sdk-py](https://github.com/ATP-Protocol/atp-protocol-sdk-py) |

## Installation

### TypeScript

```bash
npm install @atp-protocol/sdk
# or
yarn add @atp-protocol/sdk
```

### Python

```bash
pip install atp-protocol
```

## Quick Example

### TypeScript

```typescript
import { ATP, Contract } from '@atp-protocol/sdk';

const atp = new ATP({
  gatewayUrl: 'http://localhost:8080',
  walletPrivateKey: process.env.AGENT_WALLET_KEY,
});

// Load a contract
const contract = Contract.from(
  require('./contracts/user-deletion.json')
);

// Propose an action
const action = await atp.actions.propose({
  type: 'user.delete',
  target: { userId: '12345' },
});

// Wait for approval
const approved = await atp.actions.waitForApproval(action.id);

// Execute if approved
if (approved.status === 'approved') {
  const result = await atp.actions.execute(action.id);
  console.log(`Action outcome: ${result.outcome}`);
}
```

### Python

```python
from atp_protocol import ATP, Contract

atp = ATP(
    gateway_url='http://localhost:8080',
    wallet_private_key=os.getenv('AGENT_WALLET_KEY')
)

# Load a contract
contract = Contract.from_file('./contracts/user-deletion.json')

# Propose an action
action = atp.actions.propose(
    action_type='user.delete',
    target={'user_id': '12345'}
)

# Wait for approval
approved = atp.actions.wait_for_approval(action.id)

# Execute if approved
if approved.status == 'approved':
    result = atp.actions.execute(action.id)
    print(f"Action outcome: {result.outcome}")
```

## Core APIs

All SDKs expose these core APIs:

### ATP (Main Client)

Initialize the ATP client:

```typescript
const atp = new ATP({
  gatewayUrl: 'http://localhost:8080',
  walletPrivateKey: process.env.AGENT_WALLET_KEY,
  organization: 'com.acme',
  credentialsBrokerUrl: 'http://localhost:8081',
  evidenceAttestation: {
    enabled: true,
    backendUrl: 'https://attestation.example.com'
  }
});
```

### Actions API

Propose, approve, execute, and query actions:

```typescript
// Propose
const action = await atp.actions.propose({ ... });

// Get status
const status = await atp.actions.get(action.id);

// Wait for approval
const approved = await atp.actions.waitForApproval(action.id);

// Execute
const result = await atp.actions.execute(action.id);

// List
const actions = await atp.actions.list({
  status: 'approved',
  limit: 10
});
```

### Contracts API

Load, validate, and register contracts:

```typescript
// Load from JSON
const contract = Contract.from(require('./contract.json'));

// Validate
const validation = contract.validate();

// Sign
const signed = await contract.sign([
  { signer: 'alice@acme.com', privateKey: aliceKey },
  { signer: 'bob@acme.com', privateKey: bobKey }
]);

// Register with ATP
await atp.contracts.register(signed);

// List
const contracts = await atp.contracts.list();
```

### Authority API

Manage delegations and check authority:

```typescript
// Get wallet authority
const wallet = await atp.authority.wallet('atp://com.acme/alice-cso');

// Create delegation
const delegation = new Delegation({
  delegator: 'atp://com.acme/alice-cso',
  delegatee: 'atp://com.acme/bob-eng',
  scope: { actions: ['user.delete'] }
});

// Sign and publish
const signed = await delegation.sign([aliceKey]);
await atp.delegations.publish(signed);

// Verify authority
const canApprove = await atp.authority.verify({
  approver: 'atp://com.acme/bob-eng',
  action_type: 'user.delete',
  timestamp: new Date()
});
```

### Evidence API

Generate, record, and query evidence:

```typescript
// Generate evidence after execution
const evidence = await atp.evidence.generate({
  action_id: action.id,
  outcome: 'success',
  result: { ... }
});

// Record in audit log
await atp.evidence.record(evidence);

// Attest to external backend
const attested = await atp.attestation.anchor(evidence);

// Query audit trail
const logs = await atp.audit.query({
  signer: 'agent-001',
  start_time: '2026-03-01T00:00:00Z',
  end_time: '2026-03-31T23:59:59Z'
});
```

### Credentials API

Request credentials from the broker:

```typescript
// Credentials are automatically injected during execution,
// but you can also request them manually:
const cred = await atp.credentials.get({
  action_id: action.id,
  credential_key: 'database',
  injection_method: 'unix_socket'
});
```

## Error Handling

All SDKs use exception-based error handling:

### TypeScript

```typescript
try {
  const result = await atp.actions.execute(action.id);
} catch (error) {
  if (error instanceof PolicyEvaluationError) {
    console.error('Policy rejected:', error.constraint);
  } else if (error instanceof ApprovalTimeoutError) {
    console.error('Action not approved in time');
  } else if (error instanceof CredentialError) {
    console.error('Credential injection failed');
  } else {
    console.error('Unknown error:', error.message);
  }
}
```

### Python

```python
try:
    result = atp.actions.execute(action_id)
except PolicyEvaluationError as e:
    print(f"Policy rejected: {e.constraint}")
except ApprovalTimeoutError as e:
    print("Action not approved in time")
except CredentialError as e:
    print("Credential injection failed")
except Exception as e:
    print(f"Unknown error: {str(e)}")
```

## Testing

Both SDKs provide mock implementations for testing:

### TypeScript

```typescript
import { MockATP } from '@atp-protocol/sdk/testing';

// Use in tests
const atp = new MockATP();
const action = await atp.actions.propose({ ... });
// Mock runs in-memory, no real gateway needed
```

### Python

```python
from atp_protocol.testing import MockATP

# Use in tests
atp = MockATP()
action = atp.actions.propose(...)
# Mock runs in-memory, no real gateway needed
```

## Logging

Configure logging in your SDK:

### TypeScript

```typescript
import { setLogLevel } from '@atp-protocol/sdk';

setLogLevel('debug'); // 'debug', 'info', 'warn', 'error'
// Logs go to console by default
// Or provide custom logger:
atp.setLogger(myCustomLogger);
```

### Python

```python
import logging
from atp_protocol import set_log_level

set_log_level('DEBUG')
# Or use standard Python logging
logging.basicConfig(level=logging.DEBUG)
```

## Configuration

Configure ATP via environment variables:

```bash
ATP_GATEWAY_URL=http://localhost:8080
ATP_WALLET_KEY=<private-key>
ATP_ORGANIZATION=com.acme
ATP_CREDENTIALS_BROKER_URL=http://localhost:8081
ATP_EVIDENCE_ANCHOR_ENABLED=true
ATP_LOG_LEVEL=info
```

Or programmatically:

```typescript
const atp = new ATP({
  gatewayUrl: process.env.ATP_GATEWAY_URL,
  walletPrivateKey: process.env.ATP_WALLET_KEY,
  organization: process.env.ATP_ORGANIZATION,
});
```

## Next Steps

- **[TypeScript SDK](./typescript.md)** — Complete API reference
- **[Python SDK](./python.md)** — Complete API reference
- **[Quick Start](../quick-start.md)** — 5-minute setup guide
