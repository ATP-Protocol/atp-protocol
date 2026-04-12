# Agent Trust Protocol (ATP) Specification

**Version:** 1.0.0-draft.1
**Status:** Draft
**Date:** 2026-04-12
**License:** CC BY 4.0

---

> **Note:** This specification is under active development. Breaking changes may occur before v1.0.0 is finalized.

## Abstract

The Agent Trust Protocol (ATP) is an open protocol for governed execution of AI agent actions. It standardizes how authority, policy, approval, credential access, execution controls, and evidence work when AI agents take consequential actions in operational systems.

ATP is designed to run natively on the DUAL network for wallet-bound identity, organization primitives, object state management, action provenance, and durable attestation.

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
14. [DUAL Network Integration](#14-dual-network-integration)

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
| **Wallet** | A DUAL wallet providing cryptographic identity (SECP256K1 keypair) for an agent or principal. |
| **Organization** | A DUAL organization providing the authority boundary and delegation scope. |
| **Template** | A reusable policy pattern registered on DUAL, referenced by contracts. |
| **Object** | A DUAL object representing governed business state. |
| **Attestation** | A cryptographically signed evidence record anchored on DUAL. |
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
| L5 | Attestation | Proof and evidence, on-chain anchoring. *What proof exists?* |

ATP operates at L3 and orchestrates enforcement across all five layers.

### 2.2 Four-Layer Agentic Stack

The horizontal positioning relative to commoditizing layers:

| Layer | Name | Trend |
|-------|------|-------|
| L1 | Skills & Methodology | Commoditizing |
| L2 | Tools & Execution (MCP, REST) | Commoditizing |
| L3 | **Trust & Control (ATP)** | **Defensible** |
| L4 | Finality & Evidence (DUAL) | Supporting |

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
          └── attestation recorded on DUAL
```

## 3. Core Primitives

ATP operates over six core primitives, each mapping to DUAL network constructs:

| Primitive | DUAL Mapping | Purpose |
|-----------|-------------|---------|
| **Wallet** | DUAL Wallet (SECP256K1) | Agent and principal identity |
| **Organization** | DUAL Organization | Authority boundary, delegation scope |
| **Template** | DUAL Template | Reusable policy schema |
| **Object** | DUAL Object | Governed business state |
| **Action** | DUAL Action | State transition, what agents can do |
| **Face** | DUAL Face | Presentation/disclosure layer |

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

*[Sections 5-14: To be completed in subsequent drafts.]*

---

## Status

This is a working draft. The following sections are planned for subsequent revisions:

- [ ] Section 5: Authority Model (delegation chains, hierarchical authority, cross-org federation)
- [ ] Section 6: Policy Evaluation (constraint types, evaluation order, conflict resolution)
- [ ] Section 7: Approval State Machine (states, transitions, timeout, escalation)
- [ ] Section 8: Credential Brokerage (injection model, scope constraints, rotation)
- [ ] Section 9: Execution Semantics (mediation model, outcome types, side-effect handling)
- [ ] Section 10: Evidence and Attestation (evidence schema, attestation anchoring, verification)
- [ ] Section 11: Operational Semantics (idempotency, unknown outcomes, revocation, evidence write failures)
- [ ] Section 12: Conformance Levels (Aware, Compatible, Verified, Attested)
- [ ] Section 13: Security Considerations (15 threat classes, enforcement boundaries)
- [ ] Section 14: DUAL Network Integration (wallet auth, object lifecycle, attestation API)

## References

- [ATP Contract Schema](schemas/atp-contract.schema.json)
- [ATP Positioning Document](../docs/POSITIONING.md)
- [DUAL Network](https://dual.network)
