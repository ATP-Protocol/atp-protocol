---
sidebar_position: 8
---

# Section 10: Evidence & Attestation

**Evidence** is the cryptographic proof that an action was approved, executed, and completed as claimed. This section defines the 18-field evidence schema, signing, audit trails, and blockchain anchoring.

## What is Evidence?

Evidence answers four questions:

1. **What happened?** What action was executed?
2. **Who authorized it?** Which signers approved?
3. **When did it happen?** Exact timestamp with precision
4. **What was the result?** What did the system return?

Evidence is signed by the ATP gateway, making it tamper-proof. It can be anchored to a blockchain, making it immutable.

## Evidence Schema (18 Fields)

Every evidence object contains:

```json
{
  "evidence_id": "evidence-abc123",
  "action_id": "action-12345",
  "timestamp": "2026-03-15T14:35:00.123456Z",
  "action_type": "user.delete",
  "target": {
    "type": "user",
    "id": "user-12345"
  },
  "organization": "com.acme",
  "signer_wallet": "atp://com.acme/agent-001",
  "approvers": [
    "alice@acme.com",
    "bob@acme.com"
  ],
  "contract_id": "contract-user-deletion-v1",
  "environment": "staging",
  "execution_time_ms": 245,
  "outcome": "success",
  "result_hash": "sha256:a1b2c3d4...",
  "result_summary": "User and all associated data deleted",
  "error_code": null,
  "error_message": null,
  "evidence_hash": "sha256:ef89ab01...",
  "signature": "base64-encoded-cose-sig",
  "blockchain_anchor": {
    "chain": "ethereum",
    "tx_hash": "0xdeadbeef...",
    "block": 12345678,
    "timestamp": "2026-03-15T14:35:10Z"
  }
}
```

### Field Definitions

| # | Field | Type | Purpose |
|---|-------|------|---------|
| 1 | **evidence_id** | UUID | Unique identifier for this evidence |
| 2 | **action_id** | UUID | Links to the action that was executed |
| 3 | **timestamp** | ISO 8601 | Exact time of execution (microsecond precision) |
| 4 | **action_type** | string | What action (e.g., "user.delete") |
| 5 | **target** | object | What resource (type + id) |
| 6 | **organization** | string | Which org executed this |
| 7 | **signer_wallet** | URI | Which agent wallet signed the action |
| 8 | **approvers** | array | List of humans who approved (emails) |
| 9 | **contract_id** | string | Which contract governed this action |
| 10 | **environment** | string | Where it ran (staging, prod, etc.) |
| 11 | **execution_time_ms** | integer | How long the operation took |
| 12 | **outcome** | enum | success, partial_success, failure, etc. |
| 13 | **result_hash** | string | SHA256 of the full result payload |
| 14 | **result_summary** | string | Human-readable summary of result |
| 15 | **error_code** | string | If failure, the error code |
| 16 | **error_message** | string | If failure, the error message |
| 17 | **evidence_hash** | string | SHA256 of all fields 1-16 |
| 18 | **signature** | string | COSE signature over evidence_hash |
| 19 | **blockchain_anchor** | object | (Optional) Blockchain proof of existence |

## Evidence Generation

When an action completes execution (successfully or not), ATP generates evidence:

```
1. Capture all execution details
2. Hash the result payload (SHA256)
3. Create evidence object with 18 fields
4. Compute evidence_hash of fields 1-16
5. Sign evidence_hash with ATP gateway private key
6. Record evidence in audit log
7. Optionally anchor to blockchain
```

## Signing Evidence

Evidence is signed using COSE (CBOR Object Signing and Encryption):

```json
{
  "protected": {
    "alg": "ES256",
    "kid": "gateway-key-2026-01"
  },
  "payload": "evidence_hash_base64",
  "signature": "base64-encoded-signature"
}
```

**Key:** Gateway's long-term signing key
**Algorithm:** ES256 (ECDSA with SHA-256)
**Key ID:** Identifies which key was used (for key rotation)

## Audit Trail

Every piece of evidence is recorded in an immutable audit log:

```
evidence-id | action-id | timestamp | action-type | outcome | signer | approvers
abc123      | action-x  | 2026-03-15T14:35:00Z | user.delete | success | agent-001 | alice, bob
abc124      | action-y  | 2026-03-15T14:36:00Z | database.backup | failure | agent-001 | ops@acme.com
```

The audit log is:
- **Append-only** — No deletions, only appends
- **Timestamped** — Every entry has microsecond precision
- **Signed** — Each entry is cryptographically signed
- **Indexed** — Searchable by action-id, signer, timestamp, etc.
- **Retained** — Typically 7+ years for compliance

## Audit Log Queries

Retrieve evidence for a specific action:

```typescript
const evidence = await atp.evidence.get(action_id);
// Returns the evidence object for that action
```

Query all actions by an agent in a time range:

```typescript
const logs = await atp.audit.query({
  signer: 'agent-001',
  start_time: '2026-03-01T00:00:00Z',
  end_time: '2026-03-31T23:59:59Z'
});
// Returns array of evidence objects
```

Query all actions requiring a specific contract:

```typescript
const logs = await atp.audit.query({
  contract_id: 'contract-user-deletion-v1'
});
```

## Blockchain Anchoring

Evidence can be anchored to a blockchain, creating an immutable proof of execution.

### How It Works

```
1. Evidence is generated and signed
2. Evidence hash is computed (SHA256)
3. ATP submits evidence hash to blockchain
4. Blockchain records hash in a transaction
5. Transaction is included in a block
6. Block is finalized (immutable)
7. Evidence now has blockchain anchor: {tx_hash, block, timestamp}
```

### Blockchain Integration

ATP supports Ethereum, Solana, and other EVM-compatible chains:

```json
"blockchain_anchor": {
  "chain": "ethereum",
  "tx_hash": "0xdeadbeef123456...",
  "block": 12345678,
  "block_timestamp": "2026-03-15T14:35:10Z",
  "contract_address": "0xabcd...",
  "anchor_cost_wei": "123456789",
  "anchor_status": "finalized"
}
```

### Verification

To verify evidence was anchored:

```typescript
const evidence = await atp.evidence.get(action_id);

// Check blockchain
const isAnchored = !!evidence.blockchain_anchor;
const txHash = evidence.blockchain_anchor?.tx_hash;

// Verify hash is in blockchain
const onChain = await atp.blockchain.verify(txHash);
console.log(onChain); // true or false
```

## Compliance & Forensics

Evidence enables compliance audits and forensic investigations.

### Compliance Questions

**Q: Did the user.delete action only run in staging?**
A: Query all user.delete evidence where environment == "staging"

**Q: Who approved the production deployment on 2026-03-15?**
A: Query logs for environment == "production" and action_type == "deploy" on that date

**Q: What was the total cost of provisioning in March?**
A: Sum result_summaries for action_type == "infra.provision" in March

**Q: Has this agent ever accessed production?**
A: Query all evidence where signer == "agent-001" and environment == "production"

## Evidence Retention & Privacy

Evidence is retained according to regulatory requirements:

| Regulation | Retention | Notes |
|-------------|-----------|-------|
| SOC 2 | 1 year | Standard IT audit |
| PCI-DSS | 1 year | Payment systems |
| HIPAA | 6 years | Healthcare |
| GDPR | 3 years (+ context) | Must support data subject access requests |
| CCPA | 2 years | California privacy |

Evidence can be purged after retention period, but audit log summary is kept permanently.

## SDK Usage

Generate evidence after execution:

```typescript
import { ATP, Evidence } from '@atp-protocol/sdk';

const atp = new ATP({ /* ... */ });

// Execute action
const executed = await atp.actions.execute(action_id);

// Generate evidence
const evidence = await atp.evidence.generate({
  action_id: executed.id,
  outcome: executed.outcome,
  result: executed.result,
  timestamp: new Date(),
});

console.log(evidence.evidence_id); // "evidence-abc123"
console.log(evidence.signature); // COSE signature

// Record evidence
await atp.evidence.record(evidence);

// Optionally anchor to blockchain
const anchored = await atp.blockchain.anchor(evidence, {
  chain: 'ethereum',
  gas_limit: 50000,
});

console.log(anchored.tx_hash); // Blockchain transaction
```

Query evidence:

```typescript
// Get evidence for a specific action
const evidence = await atp.evidence.get(action_id);
console.log(evidence.outcome); // success, failure, etc.

// Query audit trail
const logs = await atp.audit.query({
  signer: 'agent-001',
  start_time: '2026-03-01T00:00:00Z',
  end_time: '2026-03-31T23:59:59Z',
  limit: 100
});

logs.forEach(entry => {
  console.log(`${entry.timestamp}: ${entry.action_type} -> ${entry.outcome}`);
});

// Search for a specific pattern
const failedActions = await atp.audit.query({
  outcome: 'failure',
  start_time: '2026-03-01T00:00:00Z'
});
```

## Threat Model

The Evidence system is vulnerable to:

1. **Key compromise** — If the gateway signing key is stolen, an attacker can forge evidence
   - **Mitigation:** Key rotation every 30 days, key escrow, monitor key access logs

2. **Audit log tampering** — If the audit log database is compromised, entries can be modified
   - **Mitigation:** Write-once storage, blockchain anchoring, replicated audit logs

3. **Blockchain double-spend** — An attacker re-orgs the blockchain to change anchored evidence
   - **Mitigation:** Use finalized blocks only, wait for multiple confirmations, multi-chain anchoring

4. **Time manipulation** — Attacker changes system clock to forge timestamps
   - **Mitigation:** NTP hardening, timestamping authority, blockchain timestamps as reference

5. **Evidence omission** — An attacker suppresses certain evidence from being recorded
   - **Mitigation:** Write-once audit log, distributed logging, log aggregation

## Best Practices

1. **Always generate evidence** — Even for failed actions
2. **Sign with long-term keys** — Don't rotate gateway signing keys
3. **Anchor sensitive actions** — Production changes, financial transactions
4. **Query audit logs regularly** — Detect anomalies early
5. **Retain evidence per regulation** — Don't prune too early
6. **Encrypt evidence in transit** — TLS for all evidence transmission
7. **Back up audit logs** — Geographic distribution, long-term storage
8. **Test evidence verification** — Make sure your blockchain verification works

## Next Steps

- [Execution Semantics](./execution.md) — Learn how actions are executed
- [Conformance Testing](../conformance/overview.md) — Test your evidence implementation
