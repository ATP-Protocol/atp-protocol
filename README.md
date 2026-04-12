# ATP: The Open Governance Protocol for Agent Execution on DUAL

**Govern the action. Prove it happened.**

ATP is the open governance protocol for AI agent execution, designed to run natively on [DUAL](https://dual.network) for authority, identity, evidence, and attestation.

It gives developers and enterprises a standard way to govern how agents request authority, access tools, use credentials, obtain approvals, execute actions, and produce verifiable evidence of what happened.

## Why ATP

AI agents are moving from chat interfaces into operational systems — drafting emails, calling internal APIs, moving money, modifying infrastructure, and triggering downstream workflows.

But operational agent systems fail because nobody can answer the hard questions with confidence:

- **Who** the agent was acting for
- **What** authority it actually had
- **Which** credential path was used
- **Whether** approval was genuinely bound to the exact action executed
- **How** state changed across systems
- **What** evidence exists when something goes wrong

Those are governance questions. ATP answers them.

## How it works

```
Agent → MCP tool call
         ↓
       ATP intercepts
         ↓
       Authority check (wallet, org, role, policy)
         ↓
       Approval gate (if required by contract)
         ↓
       Credential injection (scoped, fail-closed)
         ↓
       Tool executes (under ATP mediation)
         ↓
       Evidence captured
         ↓
       Attestation recorded (on DUAL)
         ↓
       Result returned to agent
```

ATP does not compete with MCP. It governs it. MCP defines *how* an agent calls a tool. ATP defines *whether* that call should happen.

## Quick example

```typescript
import { atpGovern } from "@atp-protocol/sdk";

// Before: ungoverned MCP tool
server.tool("send-email", sendEmailHandler);

// After: ATP-governed MCP tool
server.tool("send-email", atpGovern({
  contract: "contracts/procurement-email.json",
  gateway: "https://gateway.your-org.com"
}, sendEmailHandler));
```

## Protocol specification

The full protocol specification is available at [`spec/ATP-SPEC-v1.md`](spec/ATP-SPEC-v1.md) (v1.0.0-draft.2).

**14 sections covering:**

| Section | Topic |
|---------|-------|
| 1–4 | Terminology, Architecture, Core Primitives, Execution Contract |
| 5 | Authority Model — delegation chains, hierarchical resolution, cross-org federation |
| 6 | Policy Evaluation — 8 constraint types, evaluation order, conflict resolution |
| 7 | Approval State Machine — 9 states, cryptographic binding, escalation |
| 8 | Credential Brokerage — broker model, scope constraints, fail-closed |
| 9 | Execution Semantics — 6 outcome types, mediation model, side-effect handling |
| 10 | Evidence and Attestation — evidence schema, DUAL anchoring, verification |
| 11 | Operational Semantics — idempotency, unknown outcomes, revocation, failover |
| 12 | Conformance Levels — Aware → Compatible → Verified → Attested |
| 13 | Security Considerations — 15 threat classes, enforcement boundaries |
| 14 | DUAL Network Integration — wallet auth, object lifecycle, attestation API |

## What's in this repo

```
atp-protocol/
├── spec/                    # Protocol specification
│   ├── ATP-SPEC-v1.md       # Core protocol spec (v1.0.0-draft.2, 14 sections)
│   ├── schemas/             # Canonical JSON schemas
│   │   └── atp-contract.schema.json
│   └── rfcs/                # RFC process for spec evolution
│       └── 0000-template.md
├── sdk/
│   ├── ts/                  # TypeScript SDK (@atp-protocol/sdk)
│   └── python/              # Python SDK (atp-protocol on PyPI)
├── gateway/                 # Reference gateway (@atp-protocol/gateway)
│   └── src/                 # Full governed execution pipeline with middleware
├── conformance/             # Conformance test suite (@atp-protocol/conformance)
│   └── src/                 # Fixtures, runner, self-tests
├── mcp-server/              # ATP MCP server (@atp-protocol/mcp-server)
│   └── src/                 # 12 governance tools for any MCP client
├── docs/                    # Documentation site (Docusaurus)
├── examples/                # Getting started
│   ├── contracts/           # Example ATP contracts
│   └── quick-start.ts       # Full SDK usage example
├── .github/workflows/       # CI + publish pipelines
├── LICENSE                  # Apache 2.0
├── CONTRIBUTING.md          # Contribution guidelines
└── CODE_OF_CONDUCT.md       # Community standards
```

| Package | Language | Install | Tests |
|---------|----------|---------|-------|
| `@atp-protocol/sdk` | TypeScript | `npm install @atp-protocol/sdk` | 81 |
| `atp-protocol` | Python | `pip install atp-protocol` | 116 |
| `@atp-protocol/gateway` | TypeScript | `npm install @atp-protocol/gateway` | 43 |
| `@atp-protocol/conformance` | TypeScript | `npm install @atp-protocol/conformance` | 8 |
| `@atp-protocol/mcp-server` | TypeScript | `npx @atp-protocol/mcp-server` | — |

## Conformance levels

ATP is designed as a layered standard. Adoption does not have to be all-or-nothing.

| Level | What it means | Key requirements |
|-------|---------------|------------------|
| **ATP-Aware** | System understands ATP contracts and governance metadata | Parse contracts, interpret metadata, structured logging |
| **ATP-Compatible** | System evaluates ATP policies and participates in governed execution | Authority checks, policy evaluation, approval state machine, fail-closed |
| **ATP-Verified** | System passes the published conformance suite | Credential brokerage, all outcome types, idempotency, revocation, unknown outcome handling |
| **ATP-Attested** | System produces verifiable evidence anchored through DUAL | DUAL wallet identity, organization binding, evidence anchoring, attestation verification |

## The DUAL relationship

ATP is the governance layer of DUAL, opened up for ecosystem adoption.

The protocol, SDKs, reference gateway, and conformance suite are free and open source under Apache 2.0. Developers can run ATP locally at zero cost.

DUAL provides the production-grade trust substrate: wallet-bound identity, organization primitives, object state, action provenance, and durable attestation. ATP reaches its intended form when running on DUAL.

Open source gives ATP reach. DUAL gives ATP depth.

## Status

- [x] Protocol positioning and strategy
- [x] Core contract schema
- [x] Full protocol specification (14 sections, v1.0.0-draft.2)
- [x] TypeScript SDK (4 modules, 81 tests)
- [x] Python SDK (4 modules, 116 tests)
- [x] Reference gateway with DUAL integration (full pipeline, 43 tests)
- [x] Conformance test suite (61 fixtures, 4 levels)
- [x] MCP server (12 governance tools for any MCP client)
- [x] End-to-end demo (6 governed scenarios with terminal output)
- [x] Documentation site (Docusaurus, 20+ pages)
- [x] CI pipeline (TS Node 18/20/22, Python 3.10/3.11/3.12)
- [x] Publish workflow (npm + PyPI on release)
- [ ] npm/PyPI initial publish
- [ ] Design partner program
- [ ] MCP plugin marketplace listing

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

ATP uses an RFC process for spec evolution. Proposed changes start as GitHub issues, progress to formal RFCs, and are reviewed by core maintainers.

## License

Apache 2.0 — see [LICENSE](LICENSE) for details.

The protocol specification is licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

---

**ATP is a project of [DUAL](https://dual.network).** Built for a world where agent actions need more than prompts and logs. They need a trust substrate.
