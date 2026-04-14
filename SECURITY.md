# ATP Security Policy

**Last updated:** 2026-04-12  
**Specification version:** 1.0.0-draft.2

ATP is a governance protocol for agent execution, designed to control *whether* actions happen and verify *that* they happened. This security policy defines how to report vulnerabilities, our threat model, enforcement boundaries, and known limitations.

---

## 1. Reporting Vulnerabilities

ATP is a reference implementation and specification. Security issues affect both.

### Responsible Disclosure

If you discover a security vulnerability:

1. **Do not open a public GitHub issue.** Public disclosure before a fix is available puts all ATP implementations at risk.
2. **Report via GitHub Private Vulnerability Reporting:**  
   Navigate to the [Security tab](https://github.com/ATP-Protocol/atp-protocol/security/advisories/new) of this repository and select **"Report a vulnerability"**. This is the preferred channel — it keeps the report confidential, creates a private fork for fixes, and gives you credit when the advisory is published.
3. **Alternatively, email icbmatrix@gmail.com** with:
   - The vulnerability title and description
   - Affected component(s) (spec, gateway, SDK, attestation integration)
   - A proof-of-concept if possible
   - Your recommended timeline for disclosure
4. **We will acknowledge your report within 48 hours** and provide a target remediation date.
5. **We commit to 90-day disclosure windows** at minimum. If a fix is not ready, we will publicly disclose the issue ourselves with workarounds.

### Scope

We consider security vulnerabilities:
- Authority bypass (agent gains authority it was not granted)
- Approval tampering (approvals reused, replayed, or modified)
- Credential exposure (credentials leak to untrusted components)
- Evidence suppression (records hidden or destroyed to avoid accountability)
- Authentication failure (gateway impersonation, wallet compromise)
- Policy evasion (constraints circumvented)

We do not consider security vulnerabilities:
- Denial-of-service via network saturation (operator responsibility)
- Slowloris/application-level DOS (rate limiting is documented in Section 6.2)
- Decisions to run ATP at a lower conformance level
- Vulnerabilities in downstream tools (outside ATP's scope)

### Encrypted Disclosure

For sensitive reports requiring encryption, contact icbmatrix@gmail.com to arrange a secure channel. We will provide a PGP key on request.

---

## 2. Threat Model and Mitigations

ATP's threat model is defined in Spec Section 13. This section maps the 15 threat classes to specific implementation components and code paths.

**Assumptions:**
- Agents are untrusted (may exceed authority, reuse approvals, exfiltrate credentials)
- The gateway is trusted (runs within organization's security boundary)
- External attestation backend provides cryptographic identity, integrity, and state guarantees
- Downstream tools may fail unpredictably but are called under ATP mediation
- Network paths between agent-gateway and gateway-tool may be hostile

### Threat Mapping Table

| # | Threat | Mitigation | Component | Code Path | Status |
|---|--------|-----------|-----------|-----------|--------|
| T1 | Authority escalation: Agent claims authority not granted | Authority is verified against org role bindings on every request. No implicit authority. Wallet-to-org binding verified against external attestation backend. | Gateway + SDK | `gateway.ts:155` (`checkAuthority`), `authority.ts:22-84` | Mitigated |
| T2 | Approval reuse: Agent uses prior approval for different action | Approvals are cryptographically bound to exact contract, action, scope, wallet, and nonce. Nonce binding prevents substitution. `ApprovalFlow` enforces deterministic state machine. | Gateway + SDK | `state-machine.ts:68-224`, `gateway.ts:335-378` (`executeApproved`), approval binding verified at line 356 | Mitigated |
| T3 | Approval replay: Agent replays approval from previous execution | Single-use nonces enforced. Gateway rejects any approval with previously consumed nonce. Nonce generated during flow creation; binding persists in evidence. | Gateway | `gateway.ts:186-196`, approval store tracks consumed nonces (implementation: `store.ts`) | Mitigated |
| T4 | Credential exfiltration: Agent captures/persists credentials | Credentials never transit the agent. Gateway resolves from vault, injects directly into downstream call headers. Credential value is never returned in response. | Gateway | `credentials.ts:23-64` (`resolveCredentials`), `gateway.ts:214-223`, injection happens at execution time only | Mitigated |
| T5 | Credential scope escalation: Gateway injects broader scope than authorized | Contract declares maximum scope. Gateway enforces scope constraint before injection. `resolveCredentials` validates scope match. | Gateway | `credentials.ts:35-39`, scope validation enforces declared max | Mitigated |
| T6 | Contract tampering: Agent modifies contract to weaken constraints | Contracts are registered and hash-verified. Gateway evaluates registered version from `ContractStore`, not agent's copy. Contract ID is immutable. | Gateway | `gateway.ts:123-131`, contract lookup from trusted store (not from request) | Mitigated |
| T7 | Evidence tampering: Post-execution modification of evidence records | Evidence is hash-signed by gateway wallet and anchored via external attestation backend. `evidence.ts:58-61` computes request/response hashes. External attestation anchoring via `anchor.ts:24-66` creates immutable attestation. Any modification invalidates hash chain. | Gateway + Attestation backend | `evidence.ts:38-73`, `anchor.ts:24-66`, hashes computed at line 58-61, external attestation anchoring creates attestation_ref | Mitigated |
| T8 | DoS via approval flooding: Agent submits excessive approval requests | Rate limiting at contract and organization level (Spec Section 6.2). Contract can declare `approval.required_above` threshold or disable for high-volume actions. Org-level limits enforce maximum concurrent approvals. | Gateway (Operator) | `gateway.ts:177-209`, contract config controls approval gating. Rate limiting logic in policy evaluator (operator responsibility for enforcement) | Operator responsibility |
| T9 | TOCTOU (time-of-check-to-time-of-use): Conditions change between policy check and execution | Credential resolution and injection are atomic within the gateway. Revocation checks query live authority state immediately before dispatch. No gap between policy check and execution. | Gateway | `gateway.ts:152-227`, policy check (line 165), credential resolution (line 214), and execution (line 241) are sequential in same transaction | Mitigated |
| T10 | Stale delegation: Agent operates under revoked authority | Revocation propagates immediately. Authority checks query live state (not cached). Attestation backend integration refreshes at `attestation/authority.ts` with `cache_ttl` ≤ 60s (Spec 14.6). | Gateway + Attestation backend | `authority.ts:58` (`hasAuthority` query), attestation backend integration at `attestation/authority.ts` with TTL enforcement | Mitigated |
| T11 | Cross-org impersonation: Agent claims membership in different org | Wallet-to-org binding verified via external attestation backend. Federation requires explicit org agreements. Binding is queried on every request; no inheritance across orgs. | Gateway + Attestation backend | `authority.ts:47-55` (wallet binding check), attestation backend org verification in `attestation/authority.ts` | Mitigated |
| T12 | Gateway impersonation: Malicious endpoint pretends to be ATP gateway | Gateways authenticate via cryptographic signatures from external attestation backend. Agents verify gateway identity before submitting. Gateway declares conformance level and identity via TLS cert + attestation backend credentials. | Gateway (Operator) | `gateway.ts:384-394` (`getMetadata`), TLS certificate verification is operator responsibility (Spec 13.4) | Operator responsibility |
| T13 | Evidence suppression: Gateway fails to record evidence for sensitive actions | Evidence write failures trigger `evidence_status:pending` with mandatory retry. Persistent failures alert the organization. ATP-Attested conformance requires external attestation anchoring; failure halts escalation. | Gateway | `evidence.ts:66-69`, `anchor.ts:24-66`, failed anchors remain "pending" (line 61) for retry via `retryPendingAnchors` | Partially mitigated (requires operator alerting) |
| T14 | Side-channel via scope parameters: Agent encodes unauthorized instructions in scope fields | Scope parameters validated against declared constraint types. Free-text fields prohibited in high-trust contracts. `evaluatePolicy` uses type-safe matching (enum, numeric, boolean). | Gateway | `policy.ts:20-125`, all constraints are type-checked; free-text is not supported for critical actions | Mitigated |
| T15 | Prompt injection via ingested content: Malicious content in tool response influences agent behavior | ATP governs the action, not the agent's reasoning. Evidence records capture full request/response context for post-hoc analysis. Agents evaluate their own reasoning; ATP mediates execution. | Gateway + Operator | `evidence.ts:58-61` (request/response hashes), `gateway.ts:274-296` (evidence capture), operator reviews evidence for injection attacks | Operator responsibility |

### Enforcement Boundaries

What ATP enforces and what it doesn't:

| Boundary | ATP Enforces | ATP Does Not Enforce | Operator/SDK Responsibility |
|----------|-------------|---------------------|----------------------------|
| **Authority** | Who can do what, under which org, in which role, subject to revocation | Agent reasoning; what the agent decides to request | Operator: revocation propagation, role assignment |
| **Policy** | Constraint evaluation against declared rules (type-safe) | Content safety, prompt guardrails, downstream tool policy | Operator: policy configuration, tool selection |
| **Approval** | Approval binding to exact action parameters via cryptographic nonce | Approver judgment quality, approver identity (beyond wallet) | Operator: approver training, approval timeout enforcement |
| **Credentials** | Scoped injection, fail-closed access control, no credential exposure to agent | Downstream tool authorization logic, credential freshness | Operator: credential rotation, revocation, vault security |
| **Evidence** | Complete capture and attestation of all governed executions | Interpretation of evidence for compliance decisions | Operator: evidence storage, retention, audit review |
| **Execution** | Outcome classification (success/failure/timeout), mediation through governance pipeline | Downstream tool reliability or correctness | Operator: tool monitoring, error handling, SLA enforcement |

---

## 3. Security Boundaries

### What ATP Protects

- **Authority isolation:** An agent cannot act outside its declared authority (role, org). Authority is bound to cryptographic identity (via external attestation backend).
- **Approval integrity:** An approval cannot be reused (single-use nonce), replayed (nonce tracking), or modified (cryptographic binding to action scope).
- **Credential isolation:** Credentials are never exposed to agents. They are resolved, injected by the gateway into downstream calls, and immediately discarded.
- **Evidence integrity:** All governed executions produce signed, hashable evidence records. External attestation anchoring makes evidence tamper-evident.
- **Policy enforcement:** Constraints declared in contracts are evaluated type-safely. Free-text fields are not permitted in high-assurance policies.
- **Execution mediation:** Every action passes through the full ATP pipeline (authority → policy → approval → credential → execution → evidence).

### What ATP Does NOT Protect

- **Agent reasoning:** ATP does not govern *what* the agent decides to request, only *whether* that request is authorized. If an agent is prompted to request a harmful action within its authority, ATP approves it.
- **Downstream tool security:** ATP does not protect against compromised external tools. The tool executes the action; ATP only records that it did.
- **Transport security:** ATP requires TLS 1.2+, but certificate validation, key rotation, and network path security are operator responsibility.
- **Credential freshness:** ATP does not auto-refresh expired credentials. Operators must manage credential rotation and revocation.
- **Approver training:** ATP enforces that approval happened; it does not evaluate whether the approver made the right decision.
- **Confirmation bias:** Agents can re-request denied actions until an approver approves. ATP tracks requests but does not prevent spam or abuse beyond rate limits.

### Trust Assumptions

1. **The gateway is trusted.** It runs on infrastructure controlled by the organization. Compromising the gateway (e.g., stealing the gateway secret, modifying the contracts store) breaks all security guarantees.
2. **The attestation backend is available and honest.** Wallet lookups, org bindings, and attestations depend on the configured attestation backend. If the backend is compromised, authority and evidence integrity are compromised.
3. **Operators enforce policy.** ATP implements the policy declared in contracts; it does not design policy. A weak policy will be weakly enforced.
4. **Credentials are managed securely.** ATP assumes credentials are stored encrypted and accessed only by the gateway. Leaking the credential vault defeats credential isolation.

---

## 4. Known Limitations

ATP is production-ready *for the right use cases*. These limitations should inform your deployment decisions.

### In-Memory Storage (Reference Gateway)

The reference gateway implementation stores contracts, authority, credentials, and evidence in memory:

```typescript
// gateway.ts:72-77
this.contracts = new ContractStore();
this.authority = new AuthorityStore();
this.credentials = new CredentialStore();
this.evidence = new EvidenceStore();
```

**Impact:** Loss of gateway process = loss of all state. Evidence is not persisted.  
**Mitigation:** Operators must implement persistent, encrypted storage for production. The gateway implementation uses in-memory stores for development and testing. Production deployments must replace `store.ts` with a vault-backed store (e.g., encrypted PostgreSQL, HashiCorp Vault, cloud KMS).

### Evidence Write Failures

If the gateway fails to anchor evidence to the attestation backend, the evidence record is marked `evidence_status:pending`:

```typescript
// anchor.ts:59-64
const pendingEvidence: EvidenceRecord = {
  ...evidence,
  evidence_status: "pending", // Will retry later
};
evidenceStore.store(pendingEvidence);
```

**Impact:** If the attestation backend is unreachable and the gateway crashes before retrying, evidence is lost.  
**Mitigation:** Operators must implement background retry logic (`retryPendingAnchors`) and alerting. ATP guarantees evidence *capture*, not guaranteed *delivery to attestation backend*. For ATP-Attested conformance, evidence must be successfully anchored; failures should trigger operational alerts.

### No mTLS Between Agent and Gateway

The reference implementation authenticates agents via signature from external attestation backend, not mutual TLS:

```typescript
// (implied in gateway.ts, auth happens via request.wallet signature)
```

**Impact:** An attacker with network access to the gateway endpoint can send arbitrary requests. The gateway will check authority (via identity lookup on attestation backend), but without mTLS, the attacker can impersonate any identity they know about.  
**Mitigation:** Operators must implement mTLS or restrict gateway endpoint to trusted network (VPC, private IP). Spec Section 13.4 requires TLS 1.2+; mTLS is recommended for production.

### Rate Limiting is Manual

Rate limiting (Threat T8) is documented in Spec Section 6.2 as a contract-level and org-level feature, but the reference gateway does not enforce it:

```typescript
// No rate-limit middleware in gateway.ts
```

**Impact:** An agent can flood the gateway with approval requests without backpressure.  
**Mitigation:** Operators must implement rate limiting middleware (e.g., Redis-backed sliding window) before the approval gate. Contract `approval.required_above` provides threshold-based approval gating, but true rate limiting requires operator implementation.

### Credential Type-Specific Injection

The gateway supports only a fixed set of credential injection methods:

```typescript
// credentials.ts:76-91
switch (method ?? credential.credential_type) {
  case "oauth_token":
  case "bearer_token":
    headers["Authorization"] = `Bearer ${credential.value}`;
    break;
  case "basic_auth":
    headers["Authorization"] = `Basic ${Buffer.from(credential.value).toString("base64")}`;
    break;
  case "api_key":
    headers["X-API-Key"] = credential.value;
    break;
  case "custom":
    headers["X-Custom-Credential"] = credential.value;
    break;
}
```

**Impact:** Non-standard credential injection (e.g., form-encoded, query-string, custom headers) requires custom contract and gateway implementation.  
**Mitigation:** Extend the `CredentialConfig.inject_as` type and `buildInjection` function for custom schemes. Spec Section 8 allows provider-specific injection; reference implementation includes common patterns.

### Evidence Hashing Does Not Include Timestamps

Evidence hashes are computed from request/response payloads, not timing metadata:

```typescript
// evidence.ts:58-61
request_hash: sha256(JSON.stringify(input.request_payload)),
response_hash: input.response_payload
  ? sha256(JSON.stringify(input.response_payload))
  : undefined,
```

**Impact:** An attacker with write access to the evidence store can modify timestamps (e.g., to claim an action happened before revocation) without invalidating hashes.  
**Mitigation:** For high-assurance evidence, implement cryptographic timestamping (e.g., RFC 3161) or anchor evidence immediately to external attestation backend (Spec Section 14.5). External anchoring provides tamper-evident timestamps.

### Single-Process Approval State Machine

The `ApprovalFlow` state machine is in-process and not distributed:

```typescript
// state-machine.ts:68-160
export class ApprovalFlow {
  private _state: ApprovalState = "REQUESTED";
  private _history: ApprovalTransition[] = [];
  // ...
}
```

**Impact:** If an agent submits two approval requests concurrently, the state machine does not serialize them.  
**Mitigation:** Operators must use distributed locking (e.g., database advisory locks) or a dedicated approval service. Reference implementation is suitable for single-gateway deployments. Multi-gateway deployments require approval state to be persisted in a shared data store with strict consistency.

### Attestation Backend Cache Staleness

Attestation backend wallet and org data is cached with a maximum staleness of 60 seconds:

```typescript
// (Spec 14.6)
// The gateway SHOULD maintain a local cache of organization and wallet data 
// with a maximum staleness of 60 seconds.
```

**Impact:** A wallet's revocation may not propagate for up to 60 seconds.  
**Mitigation:** For time-critical revocations, operators should set `attestation.cache_ttl` to a lower value (e.g., 10s) in `gateway.ts:96`. This increases attestation backend load; balance according to your revocation velocity.

---

## 5. Conformance and Verification

ATP defines four conformance levels in Spec Section 12:

| Level | Evidence | Attestation | Backend Integration | Use Case |
|-------|----------|-------------|------------------|----------|
| **Aware** | None | None | No | Development, testing |
| **Compatible** | Local storage | None | No | Sandboxed environments, CI/CD |
| **Verified** | Local + auditable | No anchoring | Yes, for identity | Production on-prem, internal tools |
| **Attested** | Local + externally anchored | Attestation-backed | Yes, evidence anchored | High-compliance environments, regulated actions |

Your conformance level should match your risk profile:
- **Aware/Compatible:** Suitable for internal agents with low blast radius.
- **Verified:** Suitable for production agents on trusted infrastructure. Evidence is locally signed and auditable.
- **Attested:** Suitable for high-compliance environments (finance, healthcare, audit-heavy). Evidence is externally anchored and verifiable by external parties.

To declare conformance, run:

```typescript
const metadata = gateway.getMetadata();
// {
//   gateway_id: "gw_...",
//   atp_version: "1.0.0",
//   conformance_level: "verified", // or "attested"
//   attestation_backend_integration: true,
//   attestation_backend: "external-service",
//   anchor_enabled: true,
//   identity_verification: true,
// }
```

---

## 6. Security Checklist for Operators

Before deploying ATP in production:

- [ ] **Credentials:** Replace in-memory `CredentialStore` with encrypted vault (e.g., HashiCorp Vault, AWS Secrets Manager, Azure Key Vault).
- [ ] **Evidence:** Replace in-memory `EvidenceStore` with persistent database. Implement encryption at rest.
- [ ] **Authority:** Verify attestation backend integration is enabled and `cache_ttl` is appropriate for your revocation velocity.
- [ ] **Approval:** Implement rate limiting middleware and distributed approval state (if multi-gateway).
- [ ] **Transport:** Enforce TLS 1.2+ and consider mTLS between agent and gateway.
- [ ] **Monitoring:** Implement alerting for failed evidence anchoring, stale backend cache, and revocation events.
- [ ] **Testing:** Run the conformance test suite (Spec Appendix B) before production deployment.
- [ ] **Audit:** Enable audit logging for all ATP execution events (authority checks, policy denials, approvals).
- [ ] **Incident response:** Define procedures for credential compromise, evidence tampering, and unauthorized execution.

---

## References

- **Spec Section 13:** Security Considerations — threat classes, enforcement boundaries, transport security
- **Spec Section 14:** External Attestation Integration — identity authentication, org mapping, evidence attestation
- **Spec Section 12:** Conformance Levels — guidelines for deployment assurance
- **Reference Implementation:** `gateway/src/` — gateway, middleware, store interfaces

---

## Changelog

- **2026-04-12:** Initial release. Threat model mapped to reference gateway implementation v0.1.0. Conformance level: Verified (local evidence, external identity integration).
