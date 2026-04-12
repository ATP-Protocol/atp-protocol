---
sidebar_position: 3
---

# Section 5: Authority Model

The **Authority Model** defines how permissions flow through an organization. It answers the question: "Who is allowed to authorize this action?" ATP uses delegation chains and scoped authority to enable fine-grained control.

## Core Concepts

### Authority
An **authority** is the right to sign contracts or approve actions. It flows from an organization's root keys down through a chain of delegations, with each step potentially narrowing the scope.

### Delegation
A delegation transfers authority from one wallet (or role) to another, possibly with constraints. A delegation can specify:
- **Who can delegate?** (the authorizer)
- **To whom?** (the delegatee)
- **What can they do?** (scope: which action types)
- **With what constraints?** (e.g., up to $5000 per transaction)
- **For how long?** (validity window)

### Wallet
A cryptographic identity that holds authority. Wallets are identified by:
- **Public key** (for signature verification)
- **Identifier** (email, user ID, or URN)
- **Type** (human, service, agent)

## Authority Hierarchy

ATP supports three levels of authority:

```
┌──────────────────────────────┐
│  Organization Root Key       │
│  (can sign any contract)     │
└──────────┬───────────────────┘
           │
           ├─► Delegated to Alice (Chief Security Officer)
           │   └─► Can sign contracts, approve sensitive actions
           │
           ├─► Delegated to Bob (Engineering Lead)
           │   └─► Can sign contracts for non-production environments
           │
           └─► Delegated to Service Account
               └─► Can approve specific action types (user.delete)
                   within constraints (staging only, max 100/hour)
```

## Delegation Chain

When an action is approved, ATP verifies the entire delegation chain:

```
Organization Root
  └── Authority Officer (Alice@acme.com)
      └── Service Owner (Bob@acme.com)
          └── Agent Wallet (agent-001)
              └── Action Approval
```

At each step, ATP checks:
1. Is the delegatee authorized by the delegator?
2. Is the delegation still valid (within its time window)?
3. Are any constraints satisfied?

## Authority URI Format

ATP uses URIs to identify authorities uniquely. The format is:

```
atp://<organization>/<wallet-id>[@scope]
```

Examples:

```
atp://com.acme/root
atp://com.acme/alice-cso
atp://com.acme/bob-eng-lead@production
atp://com.acme/agent-001@user.delete
```

The `@scope` portion is optional and specifies what the authority can do.

## Scoped Authority

A delegation can be scoped by action type, environment, resource, or custom rules. Scopes are expressed as constraint specifications.

### Example: Scoped Delegation

Alice (CSO) can sign any contract. She delegates to Bob (Engineering Lead) with a scope:

```json
{
  "delegation_id": "delegation-bob-eng-lead",
  "delegator": "atp://com.acme/alice-cso",
  "delegatee": "atp://com.acme/bob-eng-lead",
  "scope": {
    "actions": ["user.delete", "database.backup"],
    "environments": ["staging", "development"],
    "constraints": [
      {
        "type": "rate_limit",
        "value": 50,
        "window": "1h"
      }
    ]
  },
  "validity": {
    "not_before": "2026-01-01T00:00:00Z",
    "not_after": "2026-12-31T23:59:59Z"
  },
  "signatures": [ /* ... */ ]
}
```

This means Bob can:
- Sign contracts for `user.delete` or `database.backup` actions
- Only in staging or development environments
- With a maximum rate of 50 actions per hour

Bob cannot:
- Sign contracts for production resources
- Sign contracts for `infra.provision` actions
- Exceed 50 actions per hour

## Cross-Organization Federation

ATP supports delegation across organizations. This is useful for:
- Managed services (one org manages resources in another's environment)
- Multi-tenant systems (parent org delegates to child orgs)
- Third-party integrations (you delegate to an external service)

### Federation Example

Acme Corp delegates to Cloud Provider Inc. to manage their infrastructure:

```json
{
  "delegation_id": "federation-acme-to-cloud",
  "delegator": "atp://com.acme/root",
  "delegatee": "atp://com.cloudprovider/service-account",
  "scope": {
    "actions": ["infra.provision", "infra.scale"],
    "environments": ["production"],
    "resources": {
      "region": "us-west-2",
      "account_id": "123456789"
    },
    "constraints": [
      {
        "type": "quota",
        "key": "monthly_cost",
        "value": 100000,
        "window": "30d"
      }
    ]
  },
  "validity": {
    "not_before": "2026-02-01T00:00:00Z",
    "not_after": "2026-12-31T23:59:59Z"
  },
  "signatures": [ /* signed by Acme and Cloud Provider */ ]
}
```

## Authority Verification Algorithm

When an action is approved, ATP follows this algorithm:

```
function verify_authority(action, approver_wallet):
  1. Find the contract that governs this action type
  2. Get required_signers list from contract.approval_flow
  3. Check if approver_wallet is in required_signers
  4. If not, check delegation chain:
     a. Start at organization root
     b. Follow delegations to approver_wallet
     c. At each delegation:
        i. Verify delegatee matches next in chain
        ii. Check validity (now within not_before and not_after)
        iii. Check scope constraints
     d. If entire chain valid, authority verified
  5. If authority verified, allow approval
  6. Otherwise, reject approval
```

## Revocation

Authority can be revoked in two ways:

### Immediate Revocation
```json
{
  "revocation_id": "revoke-bob-eng-lead",
  "delegation_id": "delegation-bob-eng-lead",
  "timestamp": "2026-03-01T12:00:00Z",
  "reason": "Employee termination",
  "signatures": [ /* signed by organization root */ ]
}
```

Revocations are permanent. Once issued, a revoked delegation is never valid again.

### Expiration
Set an expiration date on the delegation. It automatically expires at `not_after`.

```json
"validity": {
  "not_before": "2026-01-01T00:00:00Z",
  "not_after": "2026-06-30T23:59:59Z"
}
```

## Authority State

ATP maintains an authority state database that tracks:
- All delegations (active and revoked)
- All revocations with timestamps
- Key rotation history
- Authority audit log

When checking authority, ATP must consult this state. Authority decisions are deterministic: given the same state and time, the same decision must be made.

## SDK Usage

Check authority programmatically:

```typescript
import { Authority, Delegation } from '@atp-protocol/sdk';

const atp = new ATP({ /* ... */ });

// Get Alice's authority
const alice = atp.authority.wallet('atp://com.acme/alice-cso');
console.log(alice.authority); // Can sign any contract

// Get Bob's authority (delegated from Alice)
const bob = atp.authority.wallet('atp://com.acme/bob-eng-lead');
console.log(bob.scoped_actions); // ['user.delete', 'database.backup']
console.log(bob.scoped_environments); // ['staging', 'development']

// Create a delegation
const delegation = new Delegation({
  delegator: 'atp://com.acme/alice-cso',
  delegatee: 'atp://com.acme/service-account',
  scope: {
    actions: ['user.delete'],
    environments: ['staging'],
  },
  validity: {
    not_before: new Date(),
    not_after: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
  },
});

// Sign and publish
const signed = await delegation.sign([aliceKey]);
await atp.delegations.publish(signed);

// Verify authority before approving an action
const canApprove = await atp.authority.verify({
  approver: 'atp://com.acme/bob-eng-lead',
  action_type: 'user.delete',
  environment: 'staging',
  timestamp: new Date(),
});

if (canApprove.valid) {
  console.log('Bob can approve this action');
} else {
  console.log('Bob cannot approve:', canApprove.reason);
}
```

## Best Practices

1. **Scope narrowly** — Give each role only the minimum authority needed
2. **Time-limit delegations** — Set expiration dates, don't make them perpetual
3. **Audit revocations** — Log all revocations with reasons
4. **Rotate keys regularly** — New keys every 90 days minimum
5. **Separate duties** — Require multiple signers for sensitive actions
6. **Use scoped agents** — Give agent wallets narrow action scopes, not broad authority
7. **Track delegation chains** — Keep documentation of who delegates to whom

## Threat Model

ATP's authority model is vulnerable to:

1. **Compromised keys** — If a signer's private key is stolen, an attacker can approve actions. **Mitigation:** Key rotation, revocation, monitoring unusual approvals.

2. **Social engineering** — Someone tricks a signer into approving an unauthorized action. **Mitigation:** Clear action descriptions, logging, requiring multiple signers.

3. **Scope creep** — A delegation is issued too broadly. **Mitigation:** Careful review, narrow scopes, separation of duties.

See [Security Considerations](../spec/security.md) for detailed threat analysis.

## Next Steps

- [Policy Evaluation](./policy.md) — Learn how constraints are checked
- [Approval State Machine](./approval.md) — See how approvals flow
