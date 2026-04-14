---
sidebar_position: 1
---

# Specification Overview

The ATP specification is organized into 14 sections that define the complete protocol for agent governance. This page provides a table of contents with 1-line descriptions of each section.

## Complete Specification Index

| # | Section | Purpose |
|---|---------|---------|
| 1 | **Scope & Terminology** | Defines what ATP covers, the boundaries with other layers, and normative terminology (MUST, SHOULD, MAY, etc.) |
| 2 | **Normative References** | Lists all standards, specs, and external references that ATP depends on (e.g., JSON Schema, COSE, RFC 3629) |
| 3 | **Architecture Overview** | High-level system design, the 6 core primitives, deployment models, and threat model |
| 4 | **Execution Contracts** | Full schema and semantics for contracts (what actions are allowed, under what constraints, with what approval) |
| 5 | **Authority Model** | Delegation chains, scoped authority, cross-organization federation, and authority URIs |
| 6 | **Policy Evaluation** | The 8 constraint types (temporal, quantitative, categorical, delegation, rate limiting, etc.) and evaluation semantics |
| 7 | **Approval State Machine** | States (Proposed, Approved, Executing, Attested, Settled), transitions, escalation paths, and rejection handling |
| 8 | **Credential Brokerage** | Credential broker architecture, 5 injection methods, fail-closed enforcement, and key rotation |
| 9 | **Execution Semantics** | Action execution, mediation model, outcome types, and idempotency guarantees |
| 10 | **Evidence & Attestation** | Evidence schema (18 fields), signing, audit trails, and external attestation |
| 11 | **Cryptography & Signing** | Key types, signature schemes, wallet architecture, and signature verification |
| 12 | **API Surface** | HTTP/gRPC endpoints, message formats, error handling, and versioning |
| 13 | **Conformance & Testing** | 4 conformance levels, test suites, certification criteria, and reference implementations |
| 14 | **Security Considerations** | Threat models, attack vectors, mitigations, and operational security best practices |

## Quick Links

- **Getting Started:** [Quick Start Guide](../quick-start.md)
- **Building Contracts:** [Section 4 — Execution Contracts](./contracts.md)
- **Authority & Delegation:** [Section 5 — Authority Model](./authority.md)
- **Policy Rules:** [Section 6 — Policy Evaluation](./policy.md)
- **Approval Flows:** [Section 7 — Approval State Machine](./approval.md)
- **Credential Management:** [Section 8 — Credential Brokerage](./credentials.md)
- **Execution & Outcomes:** [Section 9 — Execution Semantics](./execution.md)
- **Audit & Proof:** [Section 10 — Evidence & Attestation](./evidence.md)

## Document Structure

Each specification section follows this structure:

1. **Purpose** — What this section covers and why it matters
2. **Normative Requirements** — Rules marked MUST, SHOULD, MAY
3. **Data Structures** — JSON schemas, field definitions, validation rules
4. **Processing Model** — Algorithms, state machines, evaluation steps
5. **Examples** — Concrete JSON examples and walkthroughs
6. **Error Handling** — What to do when things go wrong
7. **Security Considerations** — Specific threats and mitigations for this section
8. **Interoperability Notes** — How this section interacts with others

## Version History

| Version | Release Date | Major Changes |
|---------|--------------|---------------|
| 1.0.0 | 2026-01-15 | Initial release: 14 sections, reference implementation, TypeScript & Python SDKs |

## Reading Guide

**New to ATP?** Start with the [Introduction](../intro.md), then [Quick Start](../quick-start.md), then read Sections 4-7 in order.

**Building a gateway?** Read Sections 4, 6, 7, 9, 11, and 12 (contract, policy, approval, execution, crypto, API).

**Writing an SDK?** Read all sections, especially 4, 8, 10, 11, 12.

**Deploying ATP?** Read Sections 3, 8, 10, 12, 13, and 14 (architecture, credentials, evidence, API, conformance, security).

**Auditing an ATP implementation?** Focus on Sections 10, 11, 13, 14 (evidence, crypto, conformance, security).

## Full Specification

The complete specification document is available on [GitHub](https://github.com/ATP-Protocol/atp-protocol/tree/main/spec) as a set of Markdown files with full JSON schemas, state diagrams, and reference code.

## GitHub Repository

- **Spec source:** [ATP-Protocol/atp-protocol/spec/](https://github.com/ATP-Protocol/atp-protocol/tree/main/spec)
- **TypeScript SDK:** [ATP-Protocol/atp-protocol-sdk-ts](https://github.com/ATP-Protocol/atp-protocol-sdk-ts)
- **Python SDK:** [ATP-Protocol/atp-protocol-sdk-py](https://github.com/ATP-Protocol/atp-protocol-sdk-py)
- **Reference gateway:** [ATP-Protocol/atp-gateway](https://github.com/ATP-Protocol/atp-gateway)
- **Conformance suite:** [ATP-Protocol/atp-conformance](https://github.com/ATP-Protocol/atp-conformance)

## Contributing

ATP is an open-source protocol. Issues, pull requests, and discussions are welcome. See the [Contributing Guide](https://github.com/ATP-Protocol/atp-protocol/blob/main/CONTRIBUTING.md) for details.
