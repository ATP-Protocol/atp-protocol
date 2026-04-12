# DUAL Network Integration for ATP Gateway

This document describes how to use the DUAL network integration layer with the ATP Gateway, enabling wallet authentication, organization binding, and evidence anchoring on the DUAL blockchain network.

## Overview

The ATP Gateway now supports optional integration with the DUAL network (ATP Spec Section 14), providing:

1. **Wallet Verification** — Verify wallet existence and validity on DUAL network
2. **Organization Binding** — Resolve wallet-to-organization membership and roles from DUAL
3. **Authority Resolution** — Check member roles and permissions against DUAL organization definitions
4. **Evidence Anchoring** — Create DUAL attestation objects for evidence records (Spec Section 14.5)

## Architecture

```
ATP Gateway
├── gateway.ts (main execution pipeline)
├── middleware/
│   ├── anchor.ts (evidence anchoring to DUAL)
│   └── [existing middleware...]
├── dual/
│   ├── client.ts (DUAL API wrapper)
│   ├── authority.ts (authority resolution with caching)
│   ├── types.ts (DUAL type definitions)
│   └── index.ts (module exports)
└── store/ (in-memory state stores)
```

## Configuration

### Enable DUAL Integration

```typescript
import { ATPGateway } from "@atp-protocol/gateway";

const gateway = new ATPGateway({
  gateway_id: "gw_prod_01",
  dual_integration: true,
  dual: {
    enabled: true,
    endpoint: "https://api.dual.network",  // DUAL API endpoint
    api_key: "sk_...",                      // Optional API key
    network: "mainnet",                     // "mainnet" or "testnet"
    anchor_evidence: true,                  // Enable evidence anchoring
    verify_wallets: true,                   // Enable wallet verification
    cache_ttl: 60,                          // Cache TTL in seconds
  },
});
```

### Disable DUAL Integration

```typescript
const gateway = new ATPGateway({
  gateway_id: "gw_dev_01",
  dual_integration: false,  // Uses in-memory authority store only
});
```

### Development with Mock DUAL Client

When `dual_integration: true` but no endpoint is provided, the gateway uses `MockDUALClient` for testing:

```typescript
const gateway = new ATPGateway({
  gateway_id: "gw_test",
  dual_integration: true,
  // No dual config → uses MockDUALClient
});
```

## Usage

### Standard Execution (No DUAL Verification)

```typescript
// Authority is checked against the local in-memory store
const result = await gateway.execute({
  contract_id: "ctr_email",
  action: "send-email",
  params: { recipient: "vendor@example.com" },
  wallet: "0xAgent",
});

console.log(result.outcome);     // "outcome:success"
console.log(result.evidence_id); // Evidence captured locally
```

### With DUAL Integration

When DUAL integration is enabled:

1. **Evidence Capture** — Evidence is captured locally (existing behavior)
2. **Evidence Anchoring** — Evidence is asynchronously anchored to DUAL
   - Creates a DUAL attestation object
   - Records evidence hash, execution ID, contract ID, and outcome
   - Updates evidence status to "confirmed" or "pending" (if anchor fails)

```typescript
// Execution proceeds normally
const result = await gateway.execute({
  contract_id: "ctr_email",
  action: "send-email",
  params: { recipient: "vendor@example.com" },
  wallet: "0xAgent",
});

// Evidence is automatically anchored to DUAL in the background
// If DUAL is unreachable, evidence remains "pending" for retry
```

## DUAL Client API

### IDUALClient Interface

```typescript
interface IDUALClient {
  // Wallet & Identity
  verifyWallet(walletAddress: string): Promise<WalletVerification>;
  getOrganization(orgId: string): Promise<DUALOrganization>;

  // Object & State
  createObject(data: {...}): Promise<{ object_id: string }>;
  getObject(objectId: string): Promise<DUALObject>;

  // Evidence Anchoring (Spec Section 14.5)
  anchorEvidence(evidence: EvidenceRecord): Promise<AnchorResult>;
  verifyAttestation(attestationRef: string): Promise<AttestationVerification>;

  // Action Execution
  executeAction(action: {...}): Promise<ActionResult>;
}
```

### Implementations

#### RealDUALClient

Makes HTTP calls to the DUAL API endpoint:

```typescript
import { RealDUALClient } from "@atp-protocol/gateway";

const client = new RealDUALClient(
  "https://api.dual.network",
  "mainnet",
  "sk_..."  // Optional API key
);

const wallet = await client.verifyWallet("0xAgent");
```

#### MockDUALClient

In-memory mock for testing and development:

```typescript
import { MockDUALClient } from "@atp-protocol/gateway";

const client = new MockDUALClient();

// Returns canned responses without network calls
const wallet = await client.verifyWallet("0xAgent");  // Always valid for test wallets
```

## Authority Resolution

The `DUALAuthorityResolver` class resolves wallet authorities from DUAL with local caching:

```typescript
import { DUALAuthorityResolver, RealDUALClient } from "@atp-protocol/gateway";

const client = new RealDUALClient("https://api.dual.network", "mainnet");
const resolver = new DUALAuthorityResolver(client, 60);  // 60 second cache TTL

// Resolve a wallet's binding from DUAL
const binding = await resolver.resolveWalletBinding("0xAgent", "org_procurement");

if (binding) {
  console.log(binding.wallet);      // "0xAgent"
  console.log(binding.org_id);      // "org_procurement"
  console.log(binding.role);        // "procurement_agent"
  console.log(binding.authorities); // ["org.procurement.send-email", ...]
}

// Clear cache for a wallet (e.g., after role changes)
resolver.clearCache("0xAgent");

// Clear all cache entries
resolver.clearAllCache();
```

## Evidence Anchoring

### Manual Anchoring

```typescript
import { anchorEvidence } from "@atp-protocol/gateway";

const evidence = gateway.evidence.get("evi_abc123");

await anchorEvidence({
  evidence,
  dualClient: gateway.dualClient!,
  evidenceStore: gateway.evidence,
});
```

### Automatic Anchoring

When DUAL integration is enabled with `anchor_evidence: true`, evidence is automatically anchored after execution:

```typescript
// Evidence is automatically anchored in the background
const result = await gateway.execute({...});

// Evidence status will be:
// - "confirmed" if anchoring succeeds
// - "pending" if anchoring fails (for retry)
```

### Retry Pending Anchors

```typescript
import { retryPendingAnchors } from "@atp-protocol/gateway";

// Get all evidence records
const allEvidence = gateway.evidence.list();

// Find pending records
const pending = allEvidence.filter(e => e.evidence_status === "pending");

// Retry anchoring
const { succeeded, failed } = await retryPendingAnchors(
  pending,
  gateway.dualClient!,
  gateway.evidence
);

console.log(`Anchored ${succeeded}, failed ${failed}`);
```

## Failure Handling

DUAL integration is designed to fail gracefully:

### Network Unavailability

If DUAL is unreachable during evidence anchoring:

1. Execution continues normally
2. Evidence is captured locally
3. Evidence status is set to "pending"
4. Anchoring can be retried later

```typescript
const result = await gateway.execute({...});
// Execution completes successfully even if DUAL is unreachable

const evidence = gateway.evidence.get(result.evidence_id!);
console.log(evidence.evidence_status); // "pending" if anchor failed
```

### Attestation Verification

Verify an attestation on DUAL:

```typescript
const verification = await gateway.dualClient!.verifyAttestation(
  "att_obj_abc123"
);

console.log(verification.is_valid);           // true/false
console.log(verification.object_id);         // "obj_abc123"
console.log(verification.gateway_signature_valid); // true/false
```

## Gateway Metadata

The gateway exposes DUAL integration status in its metadata:

```typescript
const metadata = gateway.getMetadata();

console.log(metadata.dual_integration);   // true/false
console.log(metadata.dual_network);       // "mainnet" | "testnet" | null
console.log(metadata.dual_anchor_enabled); // true/false
console.log(metadata.dual_wallet_verify); // true/false
```

## Conformance Levels

DUAL integration affects conformance levels (ATP Spec Section 12):

- **Verified** — No DUAL integration; evidence stored locally
- **Attested** — DUAL integration enabled; evidence anchored to DUAL network

```typescript
const gateway = new ATPGateway({
  conformance_level: "attested",  // Indicates DUAL integration
  dual_integration: true,
  dual: {...},
});
```

## Types

### WalletVerification

```typescript
interface WalletVerification {
  wallet_address: string;
  is_valid: boolean;
  public_key?: string;
  network: "mainnet" | "testnet";
}
```

### DUALOrganization

```typescript
interface DUALOrganization {
  id: string;
  name: string;
  fqdn: string;
  members: DUALOrganizationMember[];
  roles: DUALOrganizationRole[];
}

interface DUALOrganizationMember {
  member_id: string;
  wallet_address: string;
  role: string;
  status: "active" | "pending" | "inactive";
  joined_at: string;
}

interface DUALOrganizationRole {
  role_id: string;
  role_name: string;
  permissions: string[];
  description?: string;
}
```

### AnchorResult

```typescript
interface AnchorResult {
  attestation_ref: string;  // "att_<object_id>"
  object_id: string;        // DUAL object ID
  anchored_at: string;      // ISO 8601 timestamp
  network: "dual-mainnet" | "dual-testnet";
  tx_hash?: string;         // Optional transaction hash
}
```

## Testing

### Unit Tests

Run all tests:

```bash
npm test
```

Test DUAL integration specifically:

```bash
npm test -- dual
```

### Test Coverage

The DUAL integration includes 23 tests:

- MockDUALClient operations (8 tests)
- DUALAuthorityResolver caching (5 tests)
- Gateway with DUAL enabled (4 tests)
- Gateway without DUAL (3 tests)
- Evidence anchoring failure handling (3 tests)

### Example Test Setup

```typescript
import { ATPGateway } from "@atp-protocol/gateway";

const gateway = new ATPGateway({
  gateway_id: "gw_test",
  dual_integration: true,
  // No endpoint → uses MockDUALClient
});

const result = await gateway.execute({
  contract_id: "ctr_email",
  action: "send-email",
  params: { recipient: "vendor@example.com" },
  wallet: "0xAgent",
});
```

## Best Practices

1. **Enable evidence anchoring in production** to get immutable attestations
2. **Use appropriate cache TTL** based on your org's frequency of role changes
3. **Monitor pending evidence** and retry anchoring periodically
4. **Test with MockDUALClient** before deploying with real DUAL endpoint
5. **Handle network failures gracefully** — execution continues even if DUAL is unreachable

## Migration Guide

### From In-Memory Authority to DUAL

1. Create DUAL organization with members and roles
2. Enable DUAL integration in gateway config
3. Evidence will automatically anchor to DUAL
4. Optionally replace in-memory `AuthorityStore` with `DUALAuthorityResolver`

### No Breaking Changes

DUAL integration is opt-in. Existing gateways continue to work without changes:

```typescript
// Still works, no DUAL integration
const gateway = new ATPGateway({ gateway_id: "gw_legacy" });
```

## Troubleshooting

### DUAL endpoint unreachable

Check:
- Network connectivity
- DUAL API endpoint URL
- API key validity
- Firewall rules

Evidence will remain "pending" and can be retried later.

### Wallet verification failures

Check:
- Wallet address is valid and registered on DUAL
- Wallet is bound to the correct organization
- Organization exists on DUAL network

### Evidence status stays "pending"

- DUAL network is unreachable
- API quota exceeded
- Invalid attestation data

Run `retryPendingAnchors()` periodically to retry.

## Specification References

- **ATP Spec Section 14** — DUAL Network Integration
- **ATP Spec Section 14.1** — Wallet Authentication
- **ATP Spec Section 14.2** — Organization Mapping
- **ATP Spec Section 14.5** — Attestation API

See `/sessions/modest-friendly-galileo/atp-protocol/spec/ATP-SPEC-v1.md` for full specification.
