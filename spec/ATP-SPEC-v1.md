# Agent Trust Protocol (ATP) Specification

**Version:** 1.0.0-draft.2
**Status:** Draft
**Date:** 2026-04-12
**License:** CC BY 4.0

---

> **Note:** This specification is under active development. Breaking changes may occur before v1.0.0 is finalized.

## Abstract

The Agent Trust Protocol (ATP) is an open protocol for governed execution of AI agent actions. It standardizes how authority, policy, approval, credential access, execution controls, and evidence work when AI agents take consequential actions in operational systems.

ATP is designed to run with pluggable attestation backends for wallet-bound identity, organization primitives, object state management, action provenance, and durable attestation.

## Table of Contents

1. [Terminology](#1-terminology)
2. [Architecture](#2-architecture)
3. [Core Primitives](#3-core-primitives)
4. [Execution Contract](#4-execution-contract)
5. [Authority Model](#5-authority-model)
6. [Policy Evaluation](#6-policy-evaluation)
7. [Approval State Machine](#7-approval-state-machine)
8. [Credential Brokerage](#8-credential-brokerage)
9. [Execution Semantics](#9-execution-semantics)
10. [Evidence and Attestation](#10-evidence-and-attestation)
11. [Operational Semantics](#11-operational-semantics)
12. [Conformance Levels](#12-conformance-levels)
13. [Security Considerations](#13-security-considerations)
14. [External Attestation Backend](#14-external-attestation-backend)

---

## 1. Terminology

| Term | Definition |
|------|-----------|
| **Agent** | An AI process that takes actions on behalf of a principal (human or organization). |
| **Action** | A consequential operation an agent requests to perform (send email, call API, modify record, execute transaction). |
| **Authority** | The delegated permission an agent has to perform specific actions within an organizational scope. |
| **Contract** | A JSON document declaring the authority, policy, approval, credential, and evidence requirements for governed execution. |
| **Gateway** | A reverse proxy that mediates governed execution: evaluating policy, gating approval, brokering credentials, and capturing evidence. |
| **Principal** | The human or organization on whose behalf an agent acts. |
| **Wallet** | A wallet providing cryptographic identity (SECP256K1 keypair) for an agent or principal. |
| **Organization** | An organization providing the authority boundary and delegation scope. |
| **Template** | A reusable policy pattern registered with an attestation backend, referenced by contracts. |
| **Object** | An object representing governed business state. |
| **Attestation** | A cryptographically signed evidence record durably attested to an external backend. |
| **Evidence** | The record of what was requested, approved, executed, denied, or left unresolved. |

## 2. Architecture

### 2.1 Five-Layer Trust Stack

ATP defines a vertical enforcement model with five layers:

| Layer | Name | Responsibility |
|-------|------|----------------|
| L1 | Identity | Wallets, organizational hierarchy, delegation. *Who is acting?* |
| L2 | Policy | Rules, schemas, compliance constraints. *What are the bounds?* |
| L3 | **Trust & Control (ATP)** | Governance, delegation enforcement, policy compliance. *Is this allowed?* |
| L4 | State | Immutable object ledger, durable business state. *What changed?* |
| L5 | Attestation | Proof and evidence, external attestation. *What proof exists?* |

ATP operates at L3 and orchestrates enforcement across all five layers.

### 2.2 Four-Layer Agentic Stack

The horizontal positioning relative to commoditizing layers:

| Layer | Name | Trend |
|-------|------|-------|
| L1 | Skills & Methodology | Commoditizing |
| L2 | Tools & Execution (MCP, REST) | Commoditizing |
| L3 | **Trust & Control (ATP)** | **Defensible** |
| L4 | Finality & Evidence (External Backend) | Supporting |

### 2.3 Governed Execution Flow

```
Agent Runtime
    │
    ▼
ATP Gateway
    ├── Authority Check (wallet, org, role, policy)
    │     └── deny if unauthorized
    ├── Approval Gate (if required by contract)
    │     └── deny if timeout/reject
    ├── Credential Injection (scoped, fail-closed)
    │     └── deny if injection fails
    ├── Execution Control (mediated action)
    │     └── handles success/failure/timeout/partial/unknown
    └── Evidence Capture
          └── attestation recorded to external backend
```

## 3. Core Primitives

ATP operates over six core primitives, each mapping to attestation backend constructs:

| Primitive | Backend Mapping | Purpose |
|-----------|-----------------|---------|
| **Wallet** | Wallet (SECP256K1) | Agent and principal identity |
| **Organization** | Organization | Authority boundary, delegation scope |
| **Template** | Template | Reusable policy schema |
| **Object** | Attested Object | Governed business state |
| **Action** | Action | State transition, what agents can do |
| **Face** | Face | Presentation/disclosure layer |

## 4. Execution Contract

The ATP Execution Contract is a JSON document conforming to `atp-contract.schema.json` (Draft 2020-12).

See `spec/schemas/atp-contract.schema.json` for the canonical schema.

### 4.1 Required Fields

- `version` — Semantic version of the contract format
- `authority` — Organization-scoped authority URI (`org.{domain}.{permission}`)
- `actions` — Array of permitted action names
- `attestation` — Evidence level (`full` | `light` | `none`)

### 4.2 Policy Precedence

Policies follow a strict hierarchy where the most restrictive wins:

1. Organization policy
2. Template policy
3. Contract policy
4. Runtime defaults

### 4.3 Failure Behavior

**Fail-closed by default.** If any policy check fails, execution is denied. This is not configurable.

## 5. Authority Model

Authority in ATP is the delegated permission an agent has to perform specific actions within an organizational scope. Authority is never implicit.

### 5.1 Authority URI

Every authority assertion uses a hierarchical URI format:

```
org.{domain}.{permission}
```

Examples:
- `org.procurement.send-email`
- `org.finance.approve-payment`
- `org.engineering.deploy-service`

The `domain` identifies the organizational unit or capability area. The `permission` identifies the specific action class. Together, they form a unique authority identifier resolvable within the organization's capability registry.

### 5.2 Delegation Chains

Authority flows from organizations to agents through explicit delegation:

```
Organization
    │
    ├── Role (e.g., procurement_agent)
    │     ├── Authority grant: org.procurement.send-email
    │     ├── Authority grant: org.procurement.read-vendors
    │     └── Constraint: max_amount ≤ $5,000
    │
    └── Role (e.g., procurement_admin)
          ├── Authority grant: org.procurement.*
          └── Constraint: none
```

**Delegation rules:**

1. An agent's authority is the intersection of: (a) the authorities granted to its role, (b) the authorities declared in the active contract, and (c) any runtime constraints applied by policy.
2. An agent MUST NOT exercise authority beyond the narrowest scope in that intersection.
3. Delegation depth is bounded. An agent cannot re-delegate its authority to another agent unless the contract explicitly permits sub-delegation via a `delegation` field.
4. Authority grants are revocable at any point in the chain. Revoking a role's authority immediately invalidates all contracts that depend on it.

### 5.3 Hierarchical Resolution

When evaluating authority, the gateway resolves the chain bottom-up:

1. Read the contract's `authority` field.
2. Verify the requesting wallet is bound to an organization member.
3. Verify the member's role includes the declared authority.
4. Verify no organization-level policy overrides deny the authority.
5. If any step fails, deny. No fallthrough.

### 5.4 Cross-Organization Federation

ATP supports federated authority for multi-org workflows:

```
org.partner-a.procurement.send-email
    ↓ delegated to
org.partner-b.agents.procurement-bot
```

Federation requires:
- An explicit federation agreement between organizations, recorded in the attestation backend.
- Both organizations MUST have active wallets and a recorded trust relationship.
- The delegating organization specifies exactly which authorities are federated, with what constraints, and for what duration.
- Federated authority is always narrower than or equal to the source authority. It cannot be expanded by the receiving organization.
- All federated executions produce evidence records in both organizations' evidence ledgers.

### 5.5 Authority Verification Response

The gateway MUST return a structured authority verification result:

```json
{
  "authorized": true,
  "authority": "org.procurement.send-email",
  "wallet": "0x...",
  "org_id": "org_abc123",
  "role": "procurement_agent",
  "constraints_applied": ["max_amount:5000", "recipient_domain:approved-vendors.com"],
  "resolved_at": "2026-04-12T10:00:00Z"
}
```

If `authorized` is `false`, the response MUST include a `denial_reason` field with one of: `wallet_not_bound`, `role_missing_authority`, `policy_override_deny`, `contract_expired`, `contract_revoked`, `federation_not_established`.

---

## 6. Policy Evaluation

Policies in ATP are enforceable constraints evaluated before execution. They are not advisory. A policy violation results in denial.

### 6.1 Policy Sources

Policies are evaluated from four sources in strict precedence order (most restrictive wins):

| Priority | Source | Description |
|----------|--------|-------------|
| 1 (highest) | Organization policy | Org-wide rules that override everything below |
| 2 | Template policy | Reusable patterns registered with attestation backend |
| 3 | Contract policy | Action-specific constraints in the `scope` field |
| 4 (lowest) | Runtime defaults | Gateway-level defaults for unconstrained fields |

### 6.2 Constraint Types

ATP defines the following constraint types for use in the `scope` field and policy documents:

| Type | Syntax | Example |
|------|--------|---------|
| **Enumeration** | Array of permitted values | `"recipient_domain": ["@internal.com", "@vendor.com"]` |
| **Numeric bound** | `min`, `max`, or both | `"max_amount": 5000` |
| **Pattern** | Regex string | `"subject_pattern": "^PO-\\d{6}"` |
| **Temporal** | ISO 8601 range | `"execution_window": {"after": "09:00", "before": "17:00", "timezone": "UTC"}` |
| **Boolean** | true/false flag | `"allow_attachments": false` |
| **Deny list** | Array of prohibited values | `"prohibited_content": ["wire transfer", "payment instructions"]` |
| **Rate limit** | Count per duration | `"rate_limit": {"max": 10, "per": "PT1H"}` |
| **Size limit** | Maximum size with unit | `"max_payload_bytes": 1048576` |

### 6.3 Evaluation Order

For a single execution request, the gateway evaluates policies in this exact order:

1. **Contract validity.** Is the contract unexpired and unrevoked?
2. **Authority check.** Does the wallet+role have the declared authority? (Section 5)
3. **Organization policy.** Do org-level rules permit this action class?
4. **Template policy.** Do template-level constraints pass?
5. **Contract scope.** Do contract-level constraints pass against the request parameters?
6. **Rate limits.** Is the agent within rate bounds?
7. **Temporal constraints.** Is the request within the permitted execution window?

Evaluation is short-circuit: the first failure terminates evaluation and returns a denial.

### 6.4 Conflict Resolution

When multiple policy sources define constraints on the same field:

- **Enumerations:** intersection of all permitted sets. If the intersection is empty, the action is denied.
- **Numeric bounds:** the tightest bound applies (`max` takes the lowest, `min` takes the highest).
- **Boolean constraints:** `false` (deny) wins over `true` (allow).
- **Deny lists:** union of all deny lists.
- **Rate limits:** the lowest rate applies.

### 6.5 Policy Evaluation Response

```json
{
  "permitted": true,
  "policies_evaluated": 4,
  "constraints_applied": [
    {"source": "organization", "field": "max_amount", "value": 10000},
    {"source": "contract", "field": "recipient_domain", "value": ["@vendor.com"]},
    {"source": "template", "field": "rate_limit", "value": {"max": 10, "per": "PT1H"}}
  ],
  "evaluated_at": "2026-04-12T10:00:01Z"
}
```

If `permitted` is `false`, the response MUST include `denial_reason` with the specific constraint that failed and its source.

---

## 7. Approval State Machine

When a contract declares `approval.required: true`, the execution request enters the approval state machine before any action is taken.

### 7.1 States

| State | Terminal | Description |
|-------|----------|-------------|
| `NONE` | — | No approval required (contract does not mandate approval) |
| `REQUESTED` | No | Approval request created, awaiting submission to approver |
| `PENDING_REVIEW` | No | Approval request delivered to approver, awaiting decision |
| `APPROVED` | Yes | Approver granted approval. Execution may proceed. |
| `DENIED` | Yes | Approver explicitly denied the request. |
| `EXPIRED` | No* | Timeout elapsed without decision. Triggers escalation if configured. |
| `ESCALATED` | No | Request promoted to next role in escalation path. |
| `DENIED_TIMEOUT` | Yes | All escalation targets exhausted without resolution. |
| `REVOKED` | Yes | Contract or approval revoked after approval was granted but before execution completed. |

*`EXPIRED` is non-terminal only if an escalation path exists. If no escalation path is defined, `EXPIRED` transitions directly to `DENIED_TIMEOUT`.

### 7.2 State Transitions

```
                    ┌──────────┐
                    │   NONE   │ (approval not required)
                    └──────────┘

┌───────────┐     ┌────────────────┐     ┌──────────┐
│ REQUESTED │────▶│ PENDING_REVIEW │────▶│ APPROVED │──▶ proceed to execution
└───────────┘     └────────────────┘     └──────────┘
                         │    │
                         │    └──────────▶ ┌──────────┐
                         │                 │  DENIED  │
                         ▼                 └──────────┘
                  ┌───────────┐
                  │  EXPIRED  │
                  └─────┬─────┘
                        │
              ┌─────────┴─────────┐
              ▼                   ▼
       ┌────────────┐     ┌───────────────┐
       │ ESCALATED  │     │ DENIED_TIMEOUT│ (no escalation path)
       └──────┬─────┘     └───────────────┘
              │
              ▼
       ┌────────────────┐
       │ PENDING_REVIEW │ (next approver in chain)
       └────────────────┘

Any non-terminal state ──▶ REVOKED (on contract revocation)
```

### 7.3 Approval Binding

An approval binds to the exact parameters of the execution request. Specifically:

- The contract ID
- The action name
- The scope parameters at time of request
- The requesting wallet
- A cryptographic nonce

If any of these values change between approval and execution, the approval is invalid and execution is denied. This prevents approval reuse attacks where an agent obtains approval for a benign action and substitutes a different one.

### 7.4 Approval Modes

**Synchronous.** The agent blocks on the approval request. The gateway holds the connection (or returns a `202 Accepted` with polling endpoint) until the approver responds or timeout fires. Suitable for low-latency workflows where an approver is available.

**Asynchronous.** The agent submits the approval request and receives a `pending_reference`. The agent polls or subscribes to a webhook for resolution. Suitable for workflows where human review may take minutes or hours.

The contract does not declare the mode explicitly. The gateway determines the mode based on timeout duration and approver availability. Contracts with timeouts under 60 seconds default to synchronous. All others default to asynchronous. Gateways MAY override this heuristic.

### 7.5 Timeout and Escalation

1. The `approval.timeout` field declares an ISO 8601 duration (e.g., `PT4H`).
2. When the timeout fires, the state transitions to `EXPIRED`.
3. If `approval.escalation_path` is defined, the gateway promotes the request to the next role. The escalation path is an ordered, comma-separated list of roles.
4. Each escalation target receives a fresh timeout of the same duration.
5. If all escalation targets exhaust without resolution, the state transitions to `DENIED_TIMEOUT`.
6. Every state transition is recorded in the evidence trail.

### 7.6 Approval Record

Every approval decision produces a durable record:

```json
{
  "approval_id": "apr_abc123",
  "contract_id": "ctr_def456",
  "action": "send-email",
  "scope_hash": "sha256:abcdef...",
  "requesting_wallet": "0x...",
  "approver_wallet": "0x...",
  "approver_role": "procurement_manager",
  "decision": "approved",
  "decided_at": "2026-04-12T10:30:00Z",
  "nonce": "n_789xyz",
  "escalation_depth": 0
}
```

---

## 8. Credential Brokerage

ATP mediates credential access so that agents never hold, see, or persist downstream tool credentials. The gateway acts as a credential broker.

### 8.1 Broker Model

```
Agent                     ATP Gateway                  Credential Store
  │                          │                              │
  │  execution request       │                              │
  │─────────────────────────▶│                              │
  │                          │  fetch credential            │
  │                          │─────────────────────────────▶│
  │                          │  scoped credential           │
  │                          │◀─────────────────────────────│
  │                          │                              │
  │                          │  inject into downstream call │
  │                          │─────────────────────────────▶│ (downstream tool)
  │                          │                              │
  │  result (no credential)  │                              │
  │◀─────────────────────────│                              │
```

The agent submits an execution request. The gateway resolves the credential, injects it into the downstream call, and returns the result. The credential never transits the agent's context.

### 8.2 Credential Resolution

The gateway resolves credentials using the contract's `credentials` block:

1. Identify the `provider` (e.g., `gmail-api`, `stripe-api`).
2. Look up the credential in the organization's credential store, scoped to the requesting wallet and role.
3. Verify the credential's scope covers the requested action (e.g., `send` for email, `charges:write` for payments).
4. If the credential is expired, attempt rotation via the provider's refresh mechanism.
5. If resolution, scope verification, or rotation fails, deny execution. Fail-closed.

### 8.3 Scope Constraints

The contract's `credentials.scope` field declares the maximum credential scope the action may use. The gateway MUST NOT inject a credential with broader scope than declared.

Example: a contract declares `"scope": ["send"]` for the Gmail API. Even if the organization's credential store holds a token with `["send", "read", "modify"]`, the gateway injects only a send-scoped token (either by requesting a down-scoped token from the provider or by validating that the action only exercises the declared scope).

If down-scoping is not technically possible for a given provider, the gateway MUST log the actual scope injected and include it in the evidence record.

### 8.4 Injection Methods

| Method | `inject_as` value | Description |
|--------|-------------------|-------------|
| OAuth 2.0 bearer token | `oauth_token` | Injected as `Authorization: Bearer {token}` header |
| API key | `api_key` | Injected as a query parameter or header per provider convention |
| Bearer token (non-OAuth) | `bearer_token` | Injected as `Authorization: Bearer {token}` header |
| HTTP Basic Auth | `basic_auth` | Injected as `Authorization: Basic {base64(user:pass)}` header |
| Custom | `custom` | Provider-specific injection. Gateway MUST document the injection path. |

### 8.5 Credential Lifecycle Events

The gateway MUST record the following credential events in the evidence trail:

| Event | Recorded when |
|-------|---------------|
| `credential_resolved` | Credential successfully fetched from store |
| `credential_scope_verified` | Credential scope matches contract requirements |
| `credential_rotated` | Credential refreshed via provider rotation |
| `credential_injection_failed` | Credential could not be injected (triggers denial) |
| `credential_scope_mismatch` | Credential scope exceeds or does not cover contract scope |
| `credential_expired` | Credential expired and rotation was not possible |

### 8.6 Fail-Closed Requirement

The `credentials.fail_closed` field MUST be `true` for all production contracts. When `fail_closed` is `true`:

- Credential resolution failure → action denied.
- Credential scope mismatch → action denied.
- Credential rotation failure → action denied.
- Credential injection failure → action denied.

Setting `fail_closed` to `false` is permitted only in development and testing environments. Gateways SHOULD emit a warning when evaluating a contract with `fail_closed: false`.

---

## 9. Execution Semantics

Once authority, policy, approval, and credentials are resolved, the gateway mediates the actual action execution.

### 9.1 Mediation Model

ATP does not execute actions directly. The gateway mediates execution by:

1. Constructing the downstream request with injected credentials.
2. Dispatching the request to the downstream tool or API.
3. Capturing the response (or lack thereof).
4. Classifying the outcome.
5. Recording the execution in the evidence trail.

The agent does not communicate with the downstream tool directly. All traffic flows through the gateway.

### 9.2 Outcome Types

Every execution produces exactly one of the following outcome types:

| Outcome | Code | Description |
|---------|------|-------------|
| **Success** | `outcome:success` | Tool returned a clear success response. State transition confirmed. |
| **Failure** | `outcome:failure` | Tool returned a clear error. No state change occurred. |
| **Denied** | `outcome:denied` | Execution was denied by ATP before reaching the tool (authority, policy, approval, or credential failure). |
| **Timeout** | `outcome:timeout` | Tool did not respond within the gateway's execution timeout. State change is unknown. |
| **Partial** | `outcome:partial` | Tool indicated partial completion (e.g., batch operation where some items succeeded). |
| **Unknown** | `outcome:unknown` | Tool returned an ambiguous response (e.g., 202 Accepted with no confirmation, network reset after request sent). |

### 9.3 Outcome Classification Rules

The gateway classifies outcomes as follows:

1. HTTP 2xx with explicit success indicator → `outcome:success`
2. HTTP 4xx or 5xx with error body → `outcome:failure`
3. HTTP 202 with no final status → `outcome:unknown`
4. Connection timeout or network error before response → `outcome:timeout`
5. Connection reset after request sent but before response → `outcome:unknown`
6. Partial success indicator in response body → `outcome:partial`
7. Any response the gateway cannot confidently classify → `outcome:unknown`

Rule 7 is the safety net. When in doubt, the outcome is unknown. ATP does not guess.

### 9.4 Execution Timeout

The gateway enforces an execution timeout separate from the approval timeout. This is the maximum time the gateway waits for the downstream tool to respond.

Default: 30 seconds. Contracts MAY override this via a `execution_timeout` field (ISO 8601 duration). The gateway enforces a maximum ceiling (configurable per deployment, recommended: 5 minutes).

### 9.5 Side-Effect Handling

For actions that produce side effects (sending an email, initiating a payment, modifying a record):

1. The gateway MUST NOT retry automatically on `outcome:timeout` or `outcome:unknown`. Side effects may have occurred.
2. The gateway MUST record the full request payload in the evidence trail so that reconciliation is possible.
3. The agent receives the outcome type and MAY initiate a reconciliation flow (Section 11).

For actions that are naturally idempotent (read operations, status checks):

1. The gateway MAY retry once on `outcome:timeout`, subject to the idempotency model declared in the contract.
2. Retries MUST use the same idempotency key.

### 9.6 Execution Record

Every execution attempt produces a record:

```json
{
  "execution_id": "exe_abc123",
  "contract_id": "ctr_def456",
  "action": "send-email",
  "outcome": "outcome:success",
  "request_hash": "sha256:...",
  "response_summary": {
    "status_code": 200,
    "body_hash": "sha256:..."
  },
  "credential_provider": "gmail-api",
  "credential_scope_used": ["send"],
  "approval_id": "apr_xyz789",
  "started_at": "2026-04-12T10:30:01Z",
  "completed_at": "2026-04-12T10:30:02Z",
  "idempotency_key": "idk_abc123",
  "gateway_id": "gw_prod_01"
}
```

---

## 10. Evidence and Attestation

ATP produces a complete evidence record for every governed execution. Evidence is the foundation of auditability, compliance, and dispute resolution.

### 10.1 Evidence Schema

An ATP evidence record contains the following fields:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `evidence_id` | string | Yes | Unique evidence identifier |
| `execution_id` | string | Yes | Reference to the execution record |
| `contract_id` | string | Yes | Contract under which the action was governed |
| `authority` | string | Yes | Authority URI that was asserted |
| `requesting_wallet` | string | Yes | Wallet that initiated the request |
| `requesting_org` | string | Yes | Organization context |
| `action` | string | Yes | Action name |
| `scope_snapshot` | object | Yes | Exact scope parameters at time of execution |
| `approval` | object | Conditional | Approval record (required if approval was mandated) |
| `credential_path` | object | Yes | Provider, scope used, injection method (credential values are NEVER recorded) |
| `outcome` | string | Yes | Outcome type (Section 9.2) |
| `request_hash` | string | Yes | SHA-256 hash of the outbound request payload |
| `response_hash` | string | Conditional | SHA-256 hash of the response payload (absent if no response received) |
| `policy_snapshot` | object | Yes | Policies evaluated and constraints applied |
| `timestamps` | object | Yes | `requested_at`, `authorized_at`, `approved_at`, `executed_at`, `evidenced_at` |
| `gateway_id` | string | Yes | Identifier of the gateway that mediated execution |
| `attestation_level` | string | Yes | `full`, `light`, or `none` |

### 10.2 Evidence Levels

| Level | What is recorded | Where |
|-------|-----------------|-------|
| `full` | Complete evidence record with all fields, hashes, and policy snapshots | Gateway + External Backend |
| `light` | Action metadata: authority, action, outcome, timestamps, wallet | Gateway + External Backend |
| `none` | No evidence recorded | Nowhere (development only) |

Production contracts MUST use `full` or `light`. Gateways MUST reject contracts with `attestation: "none"` outside of explicitly configured development environments.

### 10.3 Attestation Anchoring

For `full` and `light` evidence, the gateway anchors the evidence to the external attestation backend:

1. Gateway constructs the evidence record.
2. Gateway computes the evidence hash: `SHA-256(canonical_json(evidence_record))`.
3. Gateway signs the hash with the gateway's wallet (SECP256K1).
4. Gateway submits the signed evidence to the attestation backend as an attestation record.
5. The attestation backend records the attestation as a durable, auditable entry with provenance.
6. Gateway receives the attestation reference (unique identifier + timestamp).
7. Gateway appends the attestation reference to the local evidence record.

### 10.4 Attestation Verification

Any party with the evidence ID can verify an attestation:

1. Retrieve the evidence record from the gateway (or from the requesting organization's evidence store).
2. Retrieve the attestation record from the backend using the attestation reference.
3. Verify the evidence hash matches the attested hash.
4. Verify the gateway's wallet signature.
5. Verify the attestation record's provenance chain in the backend.

If any verification step fails, the evidence is considered unverified. This does not mean the action did not happen — it means the evidence record cannot be independently confirmed.

### 10.5 Evidence Retention

- Gateways MUST retain evidence records locally for a minimum of 90 days.
- Externally attested records are immutable and permanent.
- Organizations MAY configure longer local retention periods.
- Evidence records MUST NOT be modified after creation. Corrections are recorded as separate amendment records referencing the original evidence ID.

---

## 11. Operational Semantics

A governance protocol that only handles the happy path is not a governance protocol. This section specifies how ATP handles real-world operational conditions.

### 11.1 Idempotency

ATP assigns every execution request an idempotency key. The key is derived from:

```
idempotency_key = HMAC-SHA256(
  gateway_secret,
  contract_id || action || canonical_json(scope_params) || requesting_wallet || nonce
)
```

**Behavior by idempotency model:**

| Model | `idempotency` value | Gateway behavior on duplicate |
|-------|-------------------|-------------------------------|
| Gateway-enforced | `gateway-enforced` | Return existing execution record. Do not re-execute. |
| Tool-native | `tool-native` | Forward the request with the same idempotency key. Tool handles dedup. |
| Unsafe | `unsafe` | Log a warning. Forward the request. Duplicate side effects may occur. |

The default is `gateway-enforced`. Contracts declaring `unsafe` MUST include an acknowledgment in the `scope` field: `"idempotency_ack": true`.

### 11.2 Unknown Outcome Resolution

When an execution produces `outcome:unknown`:

1. The execution record is persisted with status `outcome:unknown`.
2. The agent receives the unknown status and a `resolution_reference`.
3. The action is treated as **potentially executed** for idempotency purposes (duplicates are blocked).
4. Resolution occurs through one of:
   - **Manual reconciliation.** A human checks the downstream system and submits a resolution (`resolved:success`, `resolved:failure`, `resolved:partial`).
   - **Automated probe.** The gateway dispatches a status check to the downstream tool (if the tool supports it) after a configurable delay.
   - **Timeout resolution.** If no resolution is provided within a configurable window (default: 24 hours), the outcome is promoted to `outcome:unresolved` and flagged for organizational review.
5. The resolution event is appended to the evidence trail. The original `outcome:unknown` record is not modified.

### 11.3 Evidence Write Failures

If the gateway executes an action successfully but fails to anchor the evidence to the attestation backend:

1. The execution is flagged as `evidence:pending`.
2. The complete evidence payload is retained in the gateway's local durable store.
3. A background reconciliation process retries the backend write with exponential backoff (initial: 5s, max: 5 minutes, max attempts: 100).
4. While `evidence:pending`, the action is marked as **unattested**.
5. Systems requiring ATP-Attested conformance MUST treat `evidence:pending` as a degraded state.
6. If all retry attempts exhaust, the evidence transitions to `evidence:failed`. The gateway MUST alert the organization. The local evidence record remains valid but is not externally attested.

### 11.4 Approval Race Conditions

**Late approval.** If an approval arrives after the timeout has fired and escalation has begun:
- The late approval is recorded but has no effect.
- The escalated approval flow continues.
- The evidence trail records both the late original and the escalated decision.

**Concurrent approvals.** If multiple approvers in an escalation chain approve simultaneously:
- The first approval to reach the gateway wins.
- Subsequent approvals are recorded as `approval:superseded`.
- Only the winning approval is bound to the execution.

**Approval after revocation.** If a contract is revoked while an approval is pending:
- The pending approval is immediately invalidated.
- The approval state transitions to `REVOKED`.
- The agent receives a terminal `denied:revoked` status.

### 11.5 Revocation Semantics

When a contract is revoked:

1. All pending approvals under the contract transition to `REVOKED`.
2. No new execution requests are accepted.
3. In-flight executions that have passed the approval gate but have not yet completed:
   - If the execution has not yet been dispatched to the downstream tool → abort and deny.
   - If the execution has been dispatched and is awaiting a response → allow completion but flag the evidence as `revoked_during_execution`.
4. Previously completed executions and their evidence records are **unaffected**. Revocation is not retroactive.
5. The revocation event is recorded in the evidence ledger with: revoker wallet, revocation reason, timestamp, and count of invalidated approvals.

Revocation triggers:
- Explicit revocation by the issuing organization.
- Explicit revocation by an authorized role in the delegation chain.
- Contract expiry (automatic revocation at `expiry` datetime).
- Organization dissolution or wallet deactivation.

### 11.6 Credential Expiry Mid-Flow

If a credential expires after approval but before execution:

1. The gateway attempts credential rotation via the provider's refresh mechanism.
2. If rotation succeeds, execution proceeds with the refreshed credential. The rotation event is recorded in evidence.
3. If rotation fails, the execution is denied with reason `credential_expired_mid_flow`.
4. The approval remains valid. The agent MAY resubmit the execution request (which will re-trigger credential resolution) without requiring re-approval, provided the original approval has not expired or been revoked.

### 11.7 Gateway Failover

If the primary gateway becomes unavailable:

1. Agents SHOULD be configured with a failover gateway endpoint.
2. The failover gateway MUST have access to the same contract registry, credential store, and wallet.
3. In-flight executions on the failed gateway are treated as `outcome:unknown` and follow the unknown outcome resolution process (Section 11.2).
4. The failover gateway MUST NOT re-execute requests that may have been dispatched by the failed primary. Idempotency keys prevent duplicate execution if the failover gateway has access to the primary's execution log.

---

## 12. Conformance Levels

ATP defines four conformance levels to support incremental adoption. Each level builds on the previous.

### 12.1 ATP-Aware

**Requirements:**

- Parse and validate ATP execution contracts against the canonical JSON schema.
- Interpret ATP governance metadata (authority, scope, approval requirements, attestation level).
- Surface ATP contract information to operators and monitoring systems.
- Log ATP-related events in a structured format.

**Does not require:** Policy enforcement, approval flow execution, credential brokerage, external attestation.

**Use case:** Monitoring tools, dashboards, compliance reporting systems that need to understand ATP-governed execution without participating in it.

### 12.2 ATP-Compatible

**Requirements (in addition to ATP-Aware):**

- Evaluate ATP policies against execution requests (Section 6).
- Enforce authority checks against organizational role bindings (Section 5).
- Implement the approval state machine (Section 7) with at least synchronous mode.
- Implement fail-closed behavior for all policy violations.
- Produce structured execution records (Section 9.6).

**Does not require:** Credential brokerage, external attestation backend integration, evidence anchoring, unknown outcome handling.

**Use case:** Development environments, internal tooling, teams evaluating ATP before full production deployment.

### 12.3 ATP-Verified

**Requirements (in addition to ATP-Compatible):**

- Implement credential brokerage with fail-closed behavior (Section 8).
- Implement both synchronous and asynchronous approval modes (Section 7.4).
- Implement all six outcome types (Section 9.2).
- Implement idempotency enforcement (Section 11.1).
- Implement unknown outcome handling (Section 11.2).
- Implement evidence write failure handling (Section 11.3).
- Implement revocation semantics (Section 11.5).
- Pass the ATP conformance test suite (published separately).

**Does not require:** External attestation backend integration for identity or attestation.

**Use case:** Production gateways and platforms that want full protocol compliance without external attestation backend integration.

### 12.4 ATP-Attested

**Requirements (in addition to ATP-Verified):**

- Bind agent and principal identity to wallets (Section 14.1).
- Bind organizational authority to organizations (Section 14.2).
- Anchor evidence records with external attestation backend (Section 10.3).
- Support attestation verification by third parties (Section 10.4).
- Implement object lifecycle for governed state (Section 14.3).
- Implement gateway failover with externally attested execution log (Section 11.7).

**Use case:** Regulated environments, high-trust enterprise deployments, cross-organization workflows, and any deployment where durable, independently verifiable evidence is required.

### 12.5 Conformance Declaration

Implementations declare their conformance level in gateway metadata:

```json
{
  "gateway_id": "gw_prod_01",
  "atp_version": "1.0.0",
  "conformance_level": "verified",
  "conformance_suite_version": "1.0.0",
  "conformance_verified_at": "2026-04-12",
  "external_attestation": false
}
```

Gateways MUST NOT claim a conformance level they have not fully implemented. The conformance test suite provides automated verification.

---

## 13. Security Considerations

This section catalogs the threat classes ATP is designed to address and the enforcement boundaries that mitigate them.

### 13.1 Threat Model

ATP's threat model assumes:

- Agents are untrusted. They may attempt to exceed their authority, reuse approvals, exfiltrate credentials, or misrepresent their identity.
- The gateway is a trusted component within the organization's security boundary.
- The external attestation backend provides cryptographic integrity guarantees for identity, state, and attestation.
- Downstream tools may behave unpredictably (timeouts, partial failures, ambiguous responses).
- The network between agent and gateway, and between gateway and downstream tools, is potentially hostile.

### 13.2 Threat Classes

| # | Threat | Mitigation |
|---|--------|------------|
| T1 | **Authority escalation.** Agent claims authority it was not granted. | Authority is verified against org role bindings on every request. No implicit authority. |
| T2 | **Approval reuse.** Agent uses a prior approval for a different action. | Approvals bind to exact contract, action, scope, wallet, and nonce. Cryptographic binding prevents substitution. |
| T3 | **Approval replay.** Agent replays an approval from a previous execution. | Nonces are single-use. The gateway rejects any approval with a previously consumed nonce. |
| T4 | **Credential exfiltration.** Agent attempts to capture or persist credentials. | Credentials never transit the agent. The gateway injects credentials directly into downstream calls. |
| T5 | **Credential scope escalation.** Gateway injects a credential with broader scope than authorized. | Contract declares maximum scope. Gateway enforces scope constraint before injection. |
| T6 | **Contract tampering.** Agent modifies a contract to weaken constraints. | Contracts are registered and hash-verified. The gateway evaluates the registered version, not the agent's copy. |
| T7 | **Evidence tampering.** Post-execution modification of evidence records. | Evidence is hash-signed by the gateway wallet and attested to external backend. Any modification invalidates the hash chain. |
| T8 | **Denial-of-service via approval flooding.** Agent submits excessive approval requests. | Rate limiting at contract and organization level (Section 6.2). |
| T9 | **Time-of-check-to-time-of-use (TOCTOU).** Conditions change between policy check and execution. | Credential resolution and injection happen atomically within the gateway. Revocation checks are performed immediately before dispatch. |
| T10 | **Stale delegation.** Agent operates under revoked authority. | Revocation propagates immediately. Authority checks query live state, not cached grants. |
| T11 | **Cross-org impersonation.** Agent claims membership in a different organization. | Wallet-to-org binding is verified with attestation backend. Federation requires explicit agreements. |
| T12 | **Gateway impersonation.** Malicious endpoint pretends to be an ATP gateway. | Gateways authenticate via wallet signatures. Agents verify gateway identity before submitting requests. |
| T13 | **Evidence suppression.** Gateway fails to record evidence for sensitive actions. | Evidence write failures trigger `evidence:pending` with mandatory retry. Persistent failures alert the organization. ATP-Attested conformance requires external attestation. |
| T14 | **Side-channel via scope parameters.** Agent encodes unauthorized instructions in scope fields. | Scope parameters are validated against declared constraint types. Free-text fields are prohibited in high-trust contracts. |
| T15 | **Prompt injection via ingested content.** Malicious content in tool responses influences agent behavior. | ATP governs the action, not the agent's reasoning. However, evidence records capture the full request/response context for post-hoc analysis. |

### 13.3 Enforcement Boundaries

| Boundary | ATP enforces | ATP does not enforce |
|----------|-------------|---------------------|
| Authority | Who can do what, under which org, in which role | What the agent decides to request (agent reasoning is out of scope) |
| Policy | Constraint evaluation against declared rules | Content safety or prompt-level guardrails |
| Approval | Binding approval to exact action parameters | Approver judgment quality |
| Credentials | Scoped injection, fail-closed access | Downstream tool authorization logic |
| Evidence | Complete capture and attestation | Interpretation of evidence for compliance decisions |
| Execution | Outcome classification and mediation | Downstream tool reliability or correctness |

### 13.4 Transport Security

- All communication between agent and gateway MUST use TLS 1.2 or higher.
- All communication between gateway and downstream tools MUST use TLS 1.2 or higher.
- All communication between gateway and attestation backend MUST use TLS 1.2 or higher.
- Gateway endpoints MUST require authentication (wallet signature or API key bound to a wallet).
- Agents MUST verify gateway TLS certificates.

---

## 14. External Attestation Backend

ATP is designed to work with pluggable external attestation backends. This section specifies how ATP primitives integrate with attestation infrastructure.

### 14.1 Wallet Authentication

Every ATP participant (agent, principal, gateway, approver) is identified by a wallet.

**Wallet binding:**
- Agents register a wallet during onboarding. The wallet's SECP256K1 keypair provides cryptographic identity.
- Every ATP request is signed by the requesting wallet. The gateway verifies the signature before processing.
- Wallet-to-organization binding is recorded in the attestation backend. The gateway queries the backend to verify membership.

**Authentication flow:**
1. Agent signs the execution request with its wallet private key.
2. Gateway verifies the signature against the wallet's public key (retrieved from attestation backend).
3. Gateway verifies the wallet is bound to the organization declared in the contract.
4. If verification fails, the request is denied with `wallet_not_bound` or `signature_invalid`.

### 14.2 Organization Mapping

ATP organizations map to attestation backend organization constructs:

| ATP concept | Backend Mapping | Notes |
|-------------|-----------------|-------|
| Organization | Organization | Authority boundary, role definitions, policy registry |
| Role | Organization Role | Permissions and authority grants |
| Member | Organization Member | Wallet-to-role binding |
| Federation | Attestation Record (agreement type) | Cross-org trust relationship |

Organization operations:
- **Create:** An organization is created with roles and authority grants mapped to ATP contracts.
- **Query:** The gateway queries the backend for organization membership, role bindings, and authority grants.
- **Update:** Role and authority changes propagate immediately to ATP policy evaluation.
- **Dissolve:** Organization dissolution triggers revocation of all associated ATP contracts.

### 14.3 Object Lifecycle

ATP-governed actions that create or modify business state produce attested objects:

```
Contract declares:
  output.object_type = "procurement_communication"
  output.initial_state = "sent"

Execution produces:
  Attested Object {
    type: "procurement_communication",
    state: "sent",
    created_by: {wallet, org, action, contract},
    provenance: {execution_id, evidence_id, attestation_ref}
  }
```

**State transitions:**
1. The contract's `output` field declares the expected object type and initial state.
2. On successful execution, the gateway creates or transitions an attested object to the declared state.
3. The object's provenance chain links to the ATP execution and evidence records.
4. Subsequent ATP-governed actions on the same object extend the provenance chain.
5. The full object lifecycle (creation, state transitions, final state) is immutably recorded with the attestation backend.

### 14.4 Action Recording

Every ATP-governed execution is recorded with the attestation backend:

- The action type corresponds to the contract's `actions` field.
- The action is recorded with the requesting wallet, organization, and contract reference.
- The action's provenance includes the execution ID, evidence ID, and outcome.
- The attestation backend's action recording provides an independent, immutable log of what agents did, complementing the gateway's evidence records.

### 14.5 Attestation API

The gateway interfaces with the attestation backend through the following operations:

| Operation | Backend API | Description |
|-----------|-----------|-------------|
| Anchor evidence | `POST /attestations` | Create an attestation record with the evidence hash and gateway signature |
| Verify attestation | `GET /attestations/{id}` | Retrieve the attestation record and verify its provenance |
| Query by execution | `GET /attestations?filter=execution_id:{id}` | Find attestations for a specific execution |
| Query by contract | `GET /attestations?filter=contract_id:{id}` | Find all attestations under a contract |
| Query by wallet | `GET /attestations?filter=wallet:{addr}` | Find all attestations involving a wallet |
| Query by org | `GET /attestations?filter=org_id:{id}` | Find all attestations within an organization |

### 14.6 Network Requirements

For ATP-Attested conformance:

- The gateway MUST maintain an active wallet with sufficient credentials for attestation actions.
- The gateway MUST have network connectivity to an attestation backend (direct or via attestation API).
- The gateway MUST handle attestation backend unavailability gracefully via the evidence write failure process (Section 11.3).
- The gateway SHOULD maintain a local cache of organization and wallet data with a maximum staleness of 60 seconds.

---

## Status

- [x] Section 1: Terminology
- [x] Section 2: Architecture
- [x] Section 3: Core Primitives
- [x] Section 4: Execution Contract
- [x] Section 5: Authority Model
- [x] Section 6: Policy Evaluation
- [x] Section 7: Approval State Machine
- [x] Section 8: Credential Brokerage
- [x] Section 9: Execution Semantics
- [x] Section 10: Evidence and Attestation
- [x] Section 11: Operational Semantics
- [x] Section 12: Conformance Levels
- [x] Section 13: Security Considerations
- [x] Section 14: External Attestation Backend
- [ ] Appendix A: Full Evidence Record Example
- [ ] Appendix B: Conformance Test Suite Reference
- [ ] Appendix C: Migration Guide (pre-ATP to ATP-Aware)

## References

- [ATP Contract Schema](schemas/atp-contract.schema.json)
- [ATP Positioning Document](../docs/POSITIONING.md)
