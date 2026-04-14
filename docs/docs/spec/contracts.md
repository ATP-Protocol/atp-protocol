---
sidebar_position: 2
---

# Section 4: Execution Contracts

An **Execution Contract** is a JSON document signed by authorized humans that specifies what actions an agent is allowed to take, under what conditions, and with what approvals. Contracts are the core governance mechanism in ATP.

## Contract Structure

Every contract MUST have this structure:

```json
{
  "version": "1.0.0",
  "id": "contract-unique-id",
  "organization": "org-name",
  "title": "Human-readable title",
  "description": "What this contract allows",
  "actions": [ /* array of action definitions */ ],
  "approval_flow": { /* who must approve */ },
  "validity": { /* when contract is active */ },
  "credentials": { /* optional credential requirements */ },
  "evidence_policy": { /* how to record proof */ }
}
```

## Required Fields

### version
**Type:** string (semantic versioning)

The contract format version. Current version is `1.0.0`. If ATP encounters a contract with a higher version, it MUST reject it.

```json
"version": "1.0.0"
```

### id
**Type:** string (alphanumeric + hyphens, 3-128 chars)

Unique identifier for this contract. Used to reference it in actions, logs, and audit trails. MUST be stable across contract versions.

```json
"id": "contract-user-deletion-staging-v1"
```

### organization
**Type:** string (domain name format)

The organization that owns and signs this contract. Organization names follow reverse domain notation (e.g., `com.acme.eng`).

```json
"organization": "com.acme"
```

### title
**Type:** string (1-256 chars)

Human-readable title suitable for audit logs and dashboards. This is what appears in approver notifications.

```json
"title": "Delete User Contract (Staging)"
```

### description
**Type:** string (1-2048 chars)

Plain English explanation of what this contract allows, why, and any important caveats. This is read by humans, not machines.

```json
"description": "Allows the user management service to delete user accounts in the staging environment, up to 100 deletions per hour. Intended for test account cleanup and development testing only. Requires approval from both the DevOps lead and the Data Privacy officer."
```

## Actions

**Type:** array of objects

Defines what action types are allowed. Each action specifies:
- **type** (string): Dot-separated action identifier, e.g., `user.delete`, `database.backup`, `infra.provision`
- **description** (string): What this action does
- **constraints** (array): Rules that MUST be satisfied for the action to execute

### Example

```json
"actions": [
  {
    "type": "user.delete",
    "description": "Delete a user account and associated data",
    "constraints": [
      {
        "type": "environment",
        "value": "staging",
        "operator": "eq"
      },
      {
        "type": "rate_limit",
        "value": 100,
        "window": "1h"
      },
      {
        "type": "time_of_day",
        "start": "09:00",
        "end": "17:00",
        "timezone": "America/New_York"
      }
    ]
  }
]
```

See [Policy Evaluation](./policy.md) for all constraint types and semantics.

## Approval Flow

**Type:** object

Specifies who must approve actions under this contract and the approval semantics.

### Fields

- **required_signers** (integer, 1-10): How many unique signers must approve? Default is 1.
- **signers** (array of strings): Email addresses or wallet identifiers of authorized approvers
- **quorum** (string, optional): Alternative to `required_signers`. Specify "2-of-3" or "3-of-5" style quorum
- **escalation_threshold** (integer, optional): Number of automated rejections before escalation to human review
- **approval_timeout** (integer, seconds, optional): How long to wait for approvals before timing out. Default 3600 (1 hour)

### Examples

**Two-signature requirement:**
```json
"approval_flow": {
  "required_signers": 2,
  "signers": ["alice@acme.com", "bob@acme.com", "charlie@acme.com"]
}
```

ATP will wait for any 2 of the 3 specified signers to approve.

**Quorum style:**
```json
"approval_flow": {
  "quorum": "2-of-3",
  "signers": ["alice@acme.com", "bob@acme.com", "charlie@acme.com"],
  "escalation_threshold": 3
}
```

If an action is rejected 3 times without approval, escalate to the full group for manual review.

## Validity

**Type:** object with temporal bounds

Specifies when this contract is active. Contracts outside their validity window are not applicable to actions.

```json
"validity": {
  "not_before": "2026-01-01T00:00:00Z",
  "not_after": "2026-12-31T23:59:59Z"
}
```

Both fields are ISO 8601 timestamps with timezone. A contract is valid if:
```
now >= not_before AND now <= not_after
```

## Credentials (Optional)

**Type:** object

If the action requires external credentials (API keys, database passwords, cloud tokens), specify how to obtain them.

```json
"credentials": {
  "database": {
    "type": "postgres",
    "broker_reference": "prod-db-credentials"
  },
  "cloud": {
    "type": "aws",
    "broker_reference": "aws-admin-role",
    "assume_role_arn": "arn:aws:iam::123456789:role/admin"
  }
}
```

See [Credential Brokerage](./credentials.md) for the full broker protocol.

## Evidence Policy (Optional)

**Type:** object

Specifies how evidence of action execution is collected, signed, and stored.

```json
"evidence_policy": {
  "required_fields": [
    "timestamp",
    "action_id",
    "signer",
    "result",
    "outcome"
  ],
  "audit_log_endpoint": "https://audit.acme.com/api/v1/events",
  "attestation": {
    "enabled": true,
    "backend": "s3-immutable-ledger",
    "backend_url": "https://attestation.example.com"
  }
}
```

## Signing a Contract

A contract is useless until it's signed by authorized humans. Signing proves that organization leadership approved this governance policy.

### Signature Schema

Each signature in a contract is:

```json
{
  "signer": "alice@acme.com",
  "signature": "base64-encoded-cose-signature",
  "timestamp": "2026-01-15T14:30:00Z",
  "key_id": "alice-2026-01",
  "algorithm": "ES256"
}
```

### Contract with Signatures

```json
{
  "version": "1.0.0",
  "id": "contract-user-deletion-v1",
  "organization": "com.acme",
  "title": "Delete User Contract",
  "description": "...",
  "actions": [ /* ... */ ],
  "approval_flow": {
    "required_signers": 2,
    "signers": ["alice@acme.com", "bob@acme.com"]
  },
  "validity": { /* ... */ },
  "signatures": [
    {
      "signer": "alice@acme.com",
      "signature": "hEShCSqJ4fDy5yYyJjq6SBV8TxWPq3Uqb7XH...",
      "timestamp": "2026-01-15T14:30:00Z",
      "key_id": "alice-2026-01",
      "algorithm": "ES256"
    },
    {
      "signer": "bob@acme.com",
      "signature": "hEShCSqJ4fDy5yYyJjq6SBV8TxWPq3Uqb7XH...",
      "timestamp": "2026-01-15T14:35:00Z",
      "key_id": "bob-2026-01",
      "algorithm": "ES256"
    }
  ]
}
```

## Contract Validation

Before a contract can be used, it MUST pass these validation checks:

1. **Schema validation** — All required fields present and correct types
2. **Signature validation** — All signatures verify with known keys
3. **Signer check** — Signers match the `approval_flow.signers` list
4. **Temporal validity** — Contract is within its `not_before` and `not_after` window
5. **Constraint syntax** — All constraints have valid types and values
6. **Organization check** — Organization is known and the signer has authority
7. **No conflicts** — No two actions have conflicting constraints

If ANY validation step fails, the contract MUST be rejected.

## Common Contract Patterns

### Pattern 1: Simple Approval

One action type, one approver.

```json
{
  "version": "1.0.0",
  "id": "contract-simple",
  "organization": "com.example",
  "title": "Simple Approval",
  "actions": [
    {
      "type": "log.write",
      "description": "Write to audit log",
      "constraints": []
    }
  ],
  "approval_flow": {
    "required_signers": 1,
    "signers": ["admin@example.com"]
  },
  "validity": {
    "not_before": "2026-01-01T00:00:00Z",
    "not_after": "2027-01-01T00:00:00Z"
  }
}
```

### Pattern 2: Multi-Signer + Rate Limit

Two approvers required, maximum 10 deletions per day.

```json
{
  "version": "1.0.0",
  "id": "contract-rate-limited",
  "organization": "com.example",
  "title": "Rate-Limited Deletion",
  "actions": [
    {
      "type": "data.delete",
      "description": "Delete data records",
      "constraints": [
        {
          "type": "rate_limit",
          "value": 10,
          "window": "24h"
        }
      ]
    }
  ],
  "approval_flow": {
    "required_signers": 2,
    "signers": ["alice@example.com", "bob@example.com"]
  },
  "validity": {
    "not_before": "2026-01-01T00:00:00Z",
    "not_after": "2026-12-31T23:59:59Z"
  }
}
```

### Pattern 3: Time-Scoped + Environment

Deletion allowed during business hours in staging only.

```json
{
  "version": "1.0.0",
  "id": "contract-business-hours-staging",
  "organization": "com.example",
  "title": "Business Hours Staging Deletion",
  "actions": [
    {
      "type": "user.delete",
      "description": "Delete user in staging",
      "constraints": [
        {
          "type": "time_of_day",
          "start": "09:00",
          "end": "17:00",
          "timezone": "America/New_York"
        },
        {
          "type": "environment",
          "value": "staging",
          "operator": "eq"
        }
      ]
    }
  ],
  "approval_flow": {
    "required_signers": 1,
    "signers": ["ops@example.com"]
  },
  "validity": {
    "not_before": "2026-01-01T00:00:00Z",
    "not_after": "2026-12-31T23:59:59Z"
  }
}
```

## SDK Usage

Create and validate contracts programmatically:

```typescript
import { Contract } from '@atp-protocol/sdk';

// Load from JSON
const contractJson = require('./contract.json');
const contract = Contract.from(contractJson);

// Validate
const result = contract.validate();
if (!result.valid) {
  console.error('Validation errors:', result.errors);
  process.exit(1);
}

// Sign (requires signer keys)
const signed = await contract.sign([
  { signer: 'alice@acme.com', privateKey: aliceKey },
  { signer: 'bob@acme.com', privateKey: bobKey },
]);

// Save signed contract
await signed.save('./contract-signed.json');

// Use in ATP
const atp = new ATP({ /* ... */ });
await atp.contracts.register(signed);
```

## Next Steps

- [Authority Model](./authority.md) — Learn how signers are authorized
- [Policy Evaluation](./policy.md) — Understand all constraint types
- [Approval State Machine](./approval.md) — See how actions flow through contracts
