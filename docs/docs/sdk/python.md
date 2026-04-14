---
sidebar_position: 3
---

# Python SDK

Complete API reference for `atp-protocol`.

## Installation

```bash
pip install atp-protocol
```

Requires Python 3.8+.

## Initialization

```python
from atp_protocol import ATP

atp = ATP(
    gateway_url='http://localhost:8080',
    wallet_private_key=os.getenv('AGENT_WALLET_KEY'),
    organization='com.acme',
    credentials_broker_url='http://localhost:8081',
    evidence_attestation={
        'enabled': True,
        'backend_url': 'https://attestation.example.com'
    }
)
```

## Core Classes

### ATP

Main client for interacting with the protocol.

#### Properties

```python
atp.actions      # ActionAPI
atp.contracts    # ContractAPI
atp.authority    # AuthorityAPI
atp.evidence     # EvidenceAPI
atp.audit        # AuditAPI
atp.credentials  # CredentialAPI
atp.attestation  # AttestationAPI
atp.wallet       # Wallet instance
```

#### Methods

```python
# Get gateway status
status = atp.health.check()
# Returns: {'status': 'healthy', 'version': '1.0.0', ...}

# Get wallet info
wallet = atp.get_wallet()
# Returns: {'id': 'atp://com.acme/agent-001', 'public_key': '...', ...}
```

### ActionAPI

Manage action proposal and execution.

```python
# Propose an action
action = atp.actions.propose(
    action_type='user.delete',
    target={'user_id': '12345'},
    metadata={
        'reason': 'User requested account deletion',
        'timestamp': datetime.utcnow().isoformat()
    }
)
# Returns: Action object with status 'proposed'

# Get action status
action = atp.actions.get('action-12345')
# Returns: Action object with current status

# Wait for approval with timeout
approved = atp.actions.wait_for_approval(
    'action-12345',
    timeout=5 * 60  # 5 minutes
)
# Returns: Action object with status 'approved' or 'rejected'

# Execute approved action
result = atp.actions.execute('action-12345')
# Returns: Action object with status 'executing' then 'attested'

# List actions
actions = atp.actions.list(
    status='approved',
    signer='agent-001',
    limit=20
)
# Returns: Paginated list of actions

# Cancel a proposed action
atp.actions.cancel(
    'action-12345',
    reason='No longer needed'
)
```

### ContractAPI

Manage execution contracts.

```python
from atp_protocol import Contract
import json

# Load from JSON
with open('./contract.json') as f:
    contract_data = json.load(f)
contract = Contract.from_dict(contract_data)

# Validate
validation = contract.validate()
# Returns: {'valid': True/False, 'errors': []}

# Sign with multiple signers
signed = contract.sign([
    {'signer': 'alice@acme.com', 'private_key': alice_key},
    {'signer': 'bob@acme.com', 'private_key': bob_key}
])
# Returns: Signed contract with signatures array

# Register contract with ATP
atp.contracts.register(signed)

# Get contract
contract = atp.contracts.get('contract-user-deletion-v1')

# List contracts
contracts = atp.contracts.list(
    organization='com.acme',
    limit=50
)

# Find matching contract for action
contracts = atp.contracts.find_matching(
    action_type='user.delete'
)
```

### AuthorityAPI

Manage authority and delegations.

```python
from atp_protocol import Delegation

# Get wallet's authority
wallet = atp.authority.get_wallet('atp://com.acme/alice-cso')
# Returns: {'id': '...', 'authority': 'full', 'scoped_actions': []}

# Create delegation
delegation = Delegation(
    delegator='atp://com.acme/alice-cso',
    delegatee='atp://com.acme/bob-eng',
    scope={
        'actions': ['user.delete', 'database.backup'],
        'environments': ['staging', 'development']
    },
    validity={
        'not_before': datetime.utcnow(),
        'not_after': datetime.utcnow() + timedelta(days=365)
    }
)

# Sign delegation
signed = delegation.sign([alice_key])

# Publish delegation
atp.delegations.publish(signed)

# Verify authority
can_approve = atp.authority.verify(
    approver='atp://com.acme/bob-eng',
    action_type='user.delete',
    environment='staging',
    timestamp=datetime.utcnow()
)
# Returns: {'valid': True/False, 'reason': '...'}

# Revoke delegation
atp.delegations.revoke(
    'delegation-id',
    reason='Employee termination'
)

# List delegations
delegations = atp.delegations.list(
    delegatee='atp://com.acme/bob-eng'
)
```

### EvidenceAPI

Generate and manage evidence.

```python
from datetime import datetime

# Generate evidence after execution
evidence = atp.evidence.generate(
    action_id='action-12345',
    outcome='success',
    result={'user_id': '12345', 'deleted_at': datetime.utcnow().isoformat()},
    timestamp=datetime.utcnow(),
    execution_time_ms=245
)

# Record evidence in audit log
atp.evidence.record(evidence)

# Get evidence by action
evidence = atp.evidence.get('action-12345')

# Query evidence
logs = atp.evidence.query(
    signer='agent-001',
    start_time='2026-03-01T00:00:00Z',
    end_time='2026-03-31T23:59:59Z',
    limit=100
)
```

### AttestationAPI

Submit evidence to external attestation backend.

```python
# Attest evidence to external backend
attested = atp.attestation.anchor(
    evidence,
    backend='s3-immutable-ledger'
)
# Returns: {'anchor_id': 'anchor-xyz123', 'timestamp': '...', ...}

# Verify attested evidence
is_valid = atp.attestation.verify(
    anchor_id='anchor-xyz123',
    evidence_hash='sha256:abc123...'
)
# Returns: True/False

# Get attestation status
status = atp.attestation.status('anchor-xyz123')
# Returns: {'status': 'pending'|'confirmed'|'verified', ...}
```

### AuditAPI

Query audit trail.

```python
# List audit entries
entries = atp.audit.list(
    start_time='2026-03-01T00:00:00Z',
    end_time='2026-03-31T23:59:59Z',
    limit=1000
)

# Query by signer
entries = atp.audit.query(
    signer='agent-001'
)

# Query by action type
entries = atp.audit.query(
    action_type='user.delete'
)

# Query by outcome
failures = atp.audit.query(
    outcome='failure'
)

# Export audit log as CSV
csv = atp.audit.export(
    format='csv',
    start_time='2026-03-01T00:00:00Z',
    end_time='2026-03-31T23:59:59Z'
)
```

### CredentialAPI

Request credentials.

```python
# Get credential (normally injected automatically)
cred = atp.credentials.get(
    action_id='action-12345',
    credential_key='database',
    injection_method='unix_socket'
)

# Revoke credential early
atp.credentials.revoke('cred-id')

# Get credential audit logs
logs = atp.credentials.audit_logs(
    credential_key='database',
    start_time='2026-03-01T00:00:00Z'
)
```

## Error Classes

```python
from atp_protocol.errors import (
    PolicyEvaluationError,
    ApprovalTimeoutError,
    CredentialError,
    ContractValidationError,
    GatewayError
)

# Policy constraint failed
try:
    action = atp.actions.execute(action_id)
except PolicyEvaluationError as e:
    print(f"Policy rejected: {e.constraint}")

# Required approval not received
except ApprovalTimeoutError as e:
    print(f"Timeout waiting for approval")

# Credential injection failed
except CredentialError as e:
    print(f"Credential failed: {e.credential_key}")

# Contract validation failed
except ContractValidationError as e:
    for error in e.errors:
        print(f"Field {error['field']}: {error['message']}")

# Network/gateway error
except GatewayError as e:
    print(f"Gateway error {e.status_code}: {e.response_body}")
```

## Testing

```python
import unittest
from atp_protocol.testing import MockATP
from atp_protocol.errors import ApprovalTimeoutError

class TestUserDeletion(unittest.TestCase):
    def setUp(self):
        self.atp = MockATP()

    def test_delete_user(self):
        action = self.atp.actions.propose(
            action_type='user.delete',
            target={'user_id': '12345'}
        )

        # Mock ATP auto-approves
        approved = self.atp.actions.wait_for_approval(action.id)
        self.assertEqual(approved.status, 'approved')

        # Execute
        result = self.atp.actions.execute(action.id)
        self.assertEqual(result.outcome, 'success')

    def test_reject_if_not_approved(self):
        self.atp.set_auto_approve(False)

        action = self.atp.actions.propose(
            action_type='user.delete',
            target={'user_id': '12345'}
        )

        with self.assertRaises(ApprovalTimeoutError):
            self.atp.actions.wait_for_approval(action.id, timeout=0.1)

if __name__ == '__main__':
    unittest.main()
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

```python
atp = ATP(
    gateway_url=os.getenv('ATP_GATEWAY_URL'),
    wallet_private_key=os.getenv('ATP_WALLET_KEY'),
    organization=os.getenv('ATP_ORGANIZATION')
)
```

## Examples

### Complete Workflow

```python
from atp_protocol import ATP, Contract
from datetime import datetime
import json

atp = ATP(
    gateway_url='http://localhost:8080',
    wallet_private_key=os.getenv('AGENT_WALLET_KEY')
)

# 1. Load contract
with open('./contract.json') as f:
    contract_data = json.load(f)
contract = Contract.from_dict(contract_data)

validation = contract.validate()
if not validation['valid']:
    raise Exception(f"Contract invalid: {validation['errors']}")

# 2. Propose action
action = atp.actions.propose(
    action_type='user.delete',
    target={'user_id': '12345'},
    metadata={'reason': 'User requested deletion'}
)
print(f"Action proposed: {action.id}")

# 3. Wait for approval
approved = atp.actions.wait_for_approval(
    action.id,
    timeout=5 * 60
)

if approved.status != 'approved':
    print(f"Action rejected: {approved.status}")
    exit(1)
print("Action approved!")

# 4. Execute action
executed = atp.actions.execute(action.id)
print(f"Execution outcome: {executed.outcome}")

# 5. Check evidence
if executed.status == 'attested':
    evidence = atp.evidence.get(action.id)
    print(f"Evidence ID: {evidence.evidence_id}")
    print(f"Signer: {evidence.signer_wallet}")
    print(f"Approvers: {', '.join(evidence.approvers)}")
    
    # Optionally attest to external backend
    if evidence.attestation_anchor:
        print(f"Attested to {evidence.attestation_anchor['backend']}")
```

## Next Steps

- [TypeScript SDK](./typescript.md) — TypeScript implementation
- [Quick Start](../quick-start.md) — 5-minute setup
- [Specification](../spec/overview.md) — Full protocol specification
