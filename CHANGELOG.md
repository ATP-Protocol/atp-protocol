# Changelog

All notable changes to ATP (the open governance protocol for agent execution) are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/) and this project adheres to [Semantic Versioning](https://semver.org/).

---

## [Unreleased]

---

## [0.1.0] - 2026-04-12 — Initial Public Release

This release provides a complete reference implementation of the ATP specification (v1.0.0-draft.2), including the TypeScript gateway, SDK, conformance test suite, and pluggable attestation backend integration.

### Specification (v1.0.0-draft.2)

**New sections (draft.1 → draft.2):**
- **Section 5:** Authority Model — wallet-to-org-role binding, authority grants, revocation semantics
- **Section 6:** Policy Evaluation — scope constraints, type-safe rule matching, short-circuit denial
- **Section 7:** Approval State Machine — 9-state machine, deterministic transitions, cryptographic nonce binding
- **Section 8:** Credential Brokerage — credential resolution, scoped injection, isolation from agents
- **Section 9:** Execution Semantics — outcome classification, timeout handling, mediation pipeline
- **Section 10:** Evidence and Attestation — evidence capture, hash-chaining, record structure
- **Section 11:** Operational Semantics — idempotency, error handling, evidence retry logic
- **Section 12:** Conformance Levels — Aware, Compatible, Verified, Attested certification framework
- **Section 13:** Security Considerations — 15 threat classes, enforcement boundaries, transport requirements
- **Section 14:** External Attestation Integration — wallet authentication, org mapping, object lifecycle, attestation API

**Key features:**
- Immutable contract registration and execution mediation
- Role-based authority with per-wallet org binding
- Type-safe constraint evaluation (enum, numeric, boolean, prohibit-list)
- Approval workflow with single-use nonces and cryptographic binding
- Credential injection without exposing secrets to agents
- Comprehensive evidence capture with external attestation anchoring
- Gateway-enforced idempotency with optional single-use keys
- Three conformance levels: Verified (prod), Compatible (sandbox), Aware (dev)

**Draft.1 (previous):**
- Covered terminology, architecture, core primitives, and contract schema only
- Used for initial architecture review and stakeholder feedback

### TypeScript Reference Gateway

**New in 0.1.0:**
- Complete ATP execution pipeline: Authority → Policy → Approval → Credentials → Execution → Evidence
- Contract and authority stores with hash verification
- Policy evaluator with type-safe constraint matching
- Approval flow state machine (9 states, deterministic transitions)
- Credential resolver with provider-agnostic injection
- Evidence capture with request/response hashing
- External attestation backend integration module for identity verification and evidence anchoring
- Built-in support for OAuth, Bearer, Basic Auth, API Key, and custom credential types
- Execution timeout enforcement with configurable limits
- Idempotency tracking per contract configuration
- Denial and success path evidence recording

**Components:**
- `gateway.ts` (444 lines): Core orchestration pipeline
- `middleware/authority.ts` (85 lines): Authority verification against org role bindings
- `middleware/credentials.ts` (95 lines): Credential resolution and injection
- `middleware/evidence.ts` (73 lines): Evidence capture and hashing
- `middleware/policy.ts` (126 lines): Scope constraint evaluation
- `middleware/anchor.ts` (105 lines): External attestation anchoring with retry logic
- `store/` (interfaces): Contract, authority, credential, evidence, approval, idempotency stores
- `attestation/` (client and types): Attestation backend wallet, org verification

**Conformance:** Verified (local evidence, external identity integration)

**Limitations:**
- In-memory storage (reference only; production must use persistent vault)
- No rate limiting enforcement (application responsibility)
- Single-process approval state machine (multi-gateway requires distributed locking)
- Attestation backend cache staleness up to 60 seconds (operator configurable)

### TypeScript SDK

**New in 0.1.0:**
- `ATPClient` class for submitting governed execution requests
- `ApprovalFlow` class implementing the approval state machine (Section 7)
- Contract builder with fluent API for defining authority, policy, approval, credentials
- Evidence type definitions and hash verification utilities
- Wallet binding and signature generation (SECP256K1)
- Conformance level declarations for self-identification
- Full TypeScript types for all ATP primitives

**Core exports:**
- `ATPClient`: Main client for submitting requests to gateways
- `ApprovalFlow`: State machine for managing approval lifecycle
- `ContractBuilder`: Fluent contract definition
- `types`: Complete type definitions (ExecutionRequest, ExecutionResponse, EvidenceRecord, etc.)
- `util`: Hash verification, signature validation, nonce generation

### Python SDK

**New in 0.1.0:**
- `ATPClient` class (parity with TypeScript)
- `ApprovalFlow` class (state machine implementation)
- Contract utilities and type definitions
- Evidence verification and hash validation
- Wallet binding and SECP256K1 signature support
- Full test coverage for state machine transitions

**Core modules:**
- `atp/client.py`: Main ATP client
- `atp/approval.py`: Approval state machine
- `atp/contracts.py`: Contract builders
- `atp/types.py`: Type definitions
- `atp/evidence.py`: Evidence handling

### MCP Server

**New in 0.1.0:**
- `@atp-protocol/mcp-server`: MCP integration for Claude and other agent platforms
- Exposes ATP gateway as a set of MCP resources (contracts, executions, evidence)
- Allows agents to submit governed execution requests through standard MCP protocol
- Real-time evidence tracking and approval status polling

**Capabilities:**
- Resource discovery (list contracts, check conformance)
- Execution submission with structured request/response
- Approval status polling
- Evidence retrieval by execution ID
- Gateway metadata exposure

### Conformance Test Suite

**New in 0.1.0:**
- 47 test cases covering all 15 threat classes (Section 13.2)
- Authority escalation tests (T1)
- Approval reuse and replay prevention (T2, T3)
- Credential isolation and scope enforcement (T4, T5)
- Contract tampering detection (T6)
- Evidence integrity (T7)
- TOCTOU prevention (T9)
- Revocation propagation (T10)
- Cross-org impersonation prevention (T11)
- Policy constraint validation (T14)

**Format:** Jest (TypeScript) and pytest (Python) with BDD-style test names

**Coverage:**
- Happy path: Contract execution with all stages passing
- Denial paths: Authority denial, policy denial, credential denial, approval denial
- Edge cases: Timeout, idempotency, concurrent approvals, attestation backend unavailability
- Security: Threat model verification, no false negatives

### Documentation

**New in 0.1.0:**
- `README.md`: Overview, quick start, architecture diagram, deployment guide
- `SECURITY.md`: Responsible disclosure policy, threat model mapping, known limitations, operator checklist
- `CONTRIBUTING.md`: How to contribute, test, and submit pull requests
- `CODE_OF_CONDUCT.md`: Community guidelines

**Specification:**
- `spec/ATP-SPEC-v1.md` (1002 lines): Complete specification with sections 1-14, full threat model, external attestation integration, conformance framework
- `spec/schemas/atp-contract.schema.json`: JSON Schema for contract validation
- `spec/rfcs/0000-template.md`: RFC process template

### Examples

**New in 0.1.0:**
- `examples/typescript-gateway.ts`: Complete gateway setup with contract registration
- `examples/typescript-agent.ts`: Agent submitting governed execution request
- `examples/approval-workflow.ts`: Full approval flow (submit → deliver → approve → execute)
- `examples/attestation-integration.ts`: Gateway with external attestation backend identity verification and evidence anchoring
- `examples/policy-constraints.ts`: Defining and evaluating policy constraints
- `examples/error-handling.ts`: Handling denial paths, timeouts, and credential failures

### Breaking Changes

None (initial release).

### Deprecations

None (initial release).

### Security

- Initial threat model review and mapping to implementation (see `SECURITY.md`)
- Spec Section 13: 15 threat classes documented with mitigations
- Responsible disclosure policy (email security@atp-protocol.org)
- 90-day disclosure window commitment

### Known Issues

- Evidence write failures on attestation backend unavailability (evidence marked "pending", requires retry)
- In-memory storage not suitable for production (operator must implement persistence)
- Attestation backend cache staleness up to 60 seconds (may delay revocation propagation)
- No built-in rate limiting enforcement (operator responsibility)
- Single-process approval state machine (multi-gateway deployments need distributed locking)

See `SECURITY.md` Section 4 for complete known limitations and mitigation strategies.

---

## Plan for 0.2.0 (Roadmap)

**Planned features:**
- PostgreSQL and SQLAlchemy-based persistent stores for production gateways
- Redis-backed rate limiting middleware
- mTLS support between agent and gateway
- Distributed approval state machine with ZooKeeper locking
- Prometheus metrics exporter
- OpenTelemetry tracing support
- Approval request UI (web component)
- Agent CLI for submitting governed requests
- Django ORM models for evidence and contracts
- Kotlin SDK (Android support)
- Go reference gateway implementation

**Spec updates:**
- Appendix A: Full evidence record example with external attestation
- Appendix B: Complete conformance test suite reference
- Appendix C: Migration guide for pre-ATP agents

---

## Glossary

- **Agent:** AI system (LLM, automation script) that requests governed execution
- **Gateway:** ATP-compliant service that enforces authority, policy, approval, credential injection, and evidence capture
- **Contract:** Immutable specification of what action an agent can take, under which authority, subject to which constraints
- **Authority:** Binding of wallet (agent identity) → organization → role → permissions
- **Approval:** Human (or designated agent) sign-off on a specific execution before it proceeds
- **Credential:** Secret (API key, OAuth token, etc.) injected by gateway into downstream tool call
- **Evidence:** Record of what happened (request, response, outcome, timestamps, who authorized it)
- **External Attestation Backend:** Service providing identity verification, org membership management, and immutable attestation
- **Conformance:** Level of assurance (Aware/Compatible/Verified/Attested) a gateway declares
- **Nonce:** Single-use random value binding an approval to a specific action (prevents replay)

---

## Contributing

See `CONTRIBUTING.md` for how to report bugs, request features, and contribute code.

---

## License

ATP is released under the [MIT License](LICENSE).
