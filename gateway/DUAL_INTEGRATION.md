# External Attestation Backend Integration for ATP Gateway

This document describes how to use the external attestation backend integration layer with the ATP Gateway, enabling identity verification, organization binding, and evidence anchoring via pluggable backends.

## Overview

The ATP Gateway now supports optional integration with external attestation backends (ATP Spec Section 14), providing:

1. **Identity Verification** — Verify identity and validity against an external backend
2. **Organization Binding** — Resolve identity-to-organization membership and roles from backend
3. **Authority Resolution** — Check member roles and permissions against backend organization definitions
4. **Evidence Anchoring** — Create attestation records for evidence via backend API (Spec Section 14.5)

## Architecture

```
ATP Gateway
├── gateway.ts (main execution pipeline)
├── middleware/
│   ├── anchor.ts (evidence anchoring to attestation backend)
│   └── [existing middleware...]
├── attestation/
│   ├── client.ts (Attestation backend API wrapper)
│   ├── authority.ts (authority resolution with caching)
│   ├── types.ts (type definitions)
│   └── index.ts (module exports)
└── store/ (in-memory state stores)
```

## Configuration

### Enable Attestation Backend Integration

```typescript
import { ATPGateway } from "@atp-protocol/gateway";

const gateway = new ATPGateway({
  gateway_id: "gw_prod_01",
  attestation_integration: true,
  attestation: {
    enabled: true,
    endpoint: "https://api.attestation-backend.example.com",  // Backend API endpoint
    api_key: "sk_...",                      // Optional API key
    backend_type: "custom-attestation",     // Backend identifier
    anchor_evidence: true,                  // Enable evidence anchoring
    verify_identities: true,                // Enable identity verification
    cache_ttl: 60,                          // Cache TTL in seconds
  },
});
```

### Disable Attestation Backend Integration

```typescript
const gateway = new ATPGateway({
  gateway_id: "gw_dev_01",
  attestation_integration: false,  // Uses in-memory authority store only
});
```

### Development with Mock Attestation Client

When `attestation_integration: true` but no endpoint is provided, the gateway uses `MockAttestationClient` for testing:

```typescript
const gateway = new ATPGateway({
  gateway_id: "gw_test",
  attestation_integration: true,
  // No attestation config → uses MockAttestationClient
});
```

## Usage

### Standard Execution (No Backend Verification)

```typescript
// Authority is checked against the local in-memory store
const result = await gateway.execute({
  contract_id: "ctr_email",
  action: "send-email",
  params: { recipient: "vendor@example.com" },
  identity: "agent-001",
});

console.log(result.outcome);     // "outcome:success"
console.log(result.evidence_id); // Evidence captured locally
```

### With Attestation Backend Integration

When attestation backend integration is enabled:

1. **Evidence Capture** — Evidence is captured locally (existing behavior)
2. **Evidence Anchoring** — Evidence is asynchronously anchored to backend
   - Creates an attestation record via backend API
   - Records evidence hash, execution ID, contract ID, and outcome
   - Updates evidence status to "confirmed" or "pending" (if anchor fails)

```typescript
// Execution proceeds normally
const result = await gateway.execute({
  contract_id: "ctr_email",
  action: "send-email",
  params: { recipient: "vendor@example.com" },
  identity: "agent-001",
});

// Evidence is automatically anchored to attestation backend in the background
// If backend is unreachable, evidence remains "pending" for retry
```

## Attestation Backend Client API

### IAttestationClient Interface

```typescript
interface IAttestationClient {
  // Identity & Organization
  verifyIdentity(identity: string): Promise<IdentityVerification>;
  getOrganization(orgId: string): Promise<Organization>;

  // Object & State
  createObject(data: {...}): Promise<{ object_id: string }>;
  getObject(objectId: string): Promise<BackendObject>;

  // Evidence Anchoring (Spec Section 14.5)
  anchorEvidence(evidence: EvidenceRecord): Promise<AnchorResult>;
  verifyAttestation(attestationRef: string): Promise<AttestationVerification>;

  // Action Execution
  executeAction(action: {...}): Promise<ActionResult>;
}
```

### Implementations

#### RealAttestationClient

Makes HTTP calls to the attestation backend API endpoint:

```typescript
import { RealAttestationClient } from "@atp-protocol/gateway";

const client = new RealAttestationClient(
  "https://api.attestation-backend.example.com",
  "custom-attestation",
  "sk_..."  // Optional API key
);

const identity = await client.verifyIdentity("agent-001");
```

#### MockAttestationClient

In-memory mock for testing and development:

```typescript
import { MockAttestationClient } from "@atp-protocol/gateway";

const client = new MockAttestationClient();

// Returns canned responses without network calls
const identity = await client.verifyIdentity("agent-001");  // Always valid for test identities
```

## Authority Resolution

The `AttestationAuthorityResolver` class resolves identity authorities from the backend with local caching:

```typescript
import { AttestationAuthorityResolver, RealAttestationClient } from "@atp-protocol/gateway";

const client = new RealAttestationClient("https://api.attestation-backend.example.com", "custom-attestation");
const resolver = new AttestationAuthorityResolver(client, 60);  // 60 second cache TTL

// Resolve an identity's binding from the backend
const binding = await resolver.resolveIdentityBinding("agent-001", "org_procurement");

if (binding) {
  console.log(binding.identity);    // "agent-001"
  console.log(binding.org_id);      // "org_procurement"
  console.log(binding.role);        // "procurement_agent"
  console.log(binding.authorities); // ["org.procurement.send-email", ...]
}

// Clear cache for an identity (e.g., after role changes)
resolver.clearCache("agent-001");

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
  attestationClient: gateway.attestationClient!,
  evidenceStore: gateway.evidence,
});
```

### Automatic Anchoring

When attestation backend integration is enabled with `anchor_evidence: true`, evidence is automatically anchored after execution:

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
  gateway.attestationClient!,
  gateway.evidence
);

console.log(`Anchored ${succeeded}, failed ${failed}`);
```

## Failure Handling

Attestation backend integration is designed to fail gracefully:

### Network Unavailability

If the backend is unreachable during evidence anchoring:

1. Execution continues normally
2. Evidence is captured locally
3. Evidence status is set to "pending"
4. Anchoring can be retried later

```typescript
const result = await gateway.execute({...});
// Execution completes successfully even if backend is unreachable

const evidence = gateway.evidence.get(result.evidence_id!);
console.log(evidence.evidence_status); // "pending" if anchor failed
```

### Attestation Verification

Verify an attestation via the backend:

```typescript
const verification = await gateway.attestationClient!.verifyAttestation(
  "att_obj_abc123"
);

console.log(verification.is_valid);           // true/false
console.log(verification.object_id);         // "obj_abc123"
console.log(verification.gateway_signature_valid); // true/false
```

## Gateway Metadata

The gateway exposes attestation backend integration status in its metadata:

```typescript
const metadata = gateway.getMetadata();

console.log(metadata.attestation_integration);   // true/false
console.log(metadata.attestation_backend);       // backend identifier or null
console.log(metadata.anchor_enabled);            // true/false
console.log(metadata.identity_verification);    // true/false
```

## Conformance Levels

Attestation backend integration affects conformance levels (ATP Spec Section 12):

- **Verified** — No attestation backend integration; evidence stored locally
- **Attested** — Attestation backend integration enabled; evidence anchored via backend

```typescript
const gateway = new ATPGateway({
  conformance_level: "attested",           // Indicates external attestation
  attestation_integration: true,
  attestation: {...},
});
```

## Types

### IdentityVerification

```typescript
interface IdentityVerification {
  identity: string;
  is_valid: boolean;
  public_key?: string;
  backend: string;
}
```

### Organization

```typescript
interface Organization {
  id: string;
  name: string;
  fqdn: string;
  members: OrganizationMember[];
  roles: OrganizationRole[];
}

interface OrganizationMember {
  member_id: string;
  identity: string;
  role: string;
  status: "active" | "pending" | "inactive";
  joined_at: string;
}

interface OrganizationRole {
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
  object_id: string;        // Backend object ID
  anchored_at: string;      // ISO 8601 timestamp
  backend: string;          // Backend identifier
  tx_hash?: string;         // Optional transaction hash
}
```

## Testing

### Unit Tests

Run all tests:

```bash
npm test
```

Test attestation backend integration specifically:

```bash
npm test -- attestation
```

### Test Coverage

The attestation backend integration includes 23 tests:

- MockAttestationClient operations (8 tests)
- AttestationAuthorityResolver caching (5 tests)
- Gateway with attestation enabled (4 tests)
- Gateway without attestation (3 tests)
- Evidence anchoring failure handling (3 tests)

### Example Test Setup

```typescript
import { ATPGateway } from "@atp-protocol/gateway";

const gateway = new ATPGateway({
  gateway_id: "gw_test",
  attestation_integration: true,
  // No endpoint → uses MockAttestationClient
});

const result = await gateway.execute({
  contract_id: "ctr_email",
  action: "send-email",
  params: { recipient: "vendor@example.com" },
  identity: "agent-001",
});
```

## Best Practices

1. **Enable evidence anchoring in production** to get immutable attestations
2. **Use appropriate cache TTL** based on your org's frequency of role changes
3. **Monitor pending evidence** and retry anchoring periodically
4. **Test with MockAttestationClient** before deploying with real backend endpoint
5. **Handle network failures gracefully** — execution continues even if backend is unreachable

## Migration Guide

### From In-Memory Authority to External Backend

1. Set up external attestation backend with organizations and members
2. Enable attestation backend integration in gateway config
3. Evidence will automatically anchor to backend
4. Optionally replace in-memory `AuthorityStore` with `AttestationAuthorityResolver`

### No Breaking Changes

Attestation backend integration is opt-in. Existing gateways continue to work without changes:

```typescript
// Still works, no attestation backend integration
const gateway = new ATPGateway({ gateway_id: "gw_legacy" });
```

## Troubleshooting

### Attestation backend endpoint unreachable

Check:
- Network connectivity
- Backend API endpoint URL
- API key validity
- Firewall rules

Evidence will remain "pending" and can be retried later.

### Identity verification failures

Check:
- Identity is valid and registered on backend
- Identity is bound to the correct organization
- Organization exists on backend

### Evidence status stays "pending"

- Attestation backend is unreachable
- API quota exceeded
- Invalid attestation data

Run `retryPendingAnchors()` periodically to retry.

## Specification References

- **ATP Spec Section 14** — External Attestation Integration
- **ATP Spec Section 14.1** — Identity Verification
- **ATP Spec Section 14.2** — Organization Mapping
- **ATP Spec Section 14.5** — Attestation API

See `/sessions/modest-friendly-galileo/atp-protocol/spec/ATP-SPEC-v1.md` for full specification.
