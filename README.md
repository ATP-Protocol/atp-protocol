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

## What's in this repo

```
atp-protocol/
├── spec/                    # Protocol specification
│   ├── ATP-SPEC-v1.md       # Core protocol spec (draft)
│   ├── schemas/             # Canonical JSON schemas
│   │   └── atp-contract.schema.json
│   └── rfcs/                # RFC process for spec evolution
│       └── 0000-template.md
├── docs/                    # Documentation and guides
│   └── POSITIONING.md       # Public strategy document
├── examples/                # Getting started examples
│   ├── hello-world/
│   └── mcp-governed-tool/
├── LICENSE                  # Apache 2.0
├── CONTRIBUTING.md          # Contribution guidelines
└── CODE_OF_CONDUCT.md       # Community standards
```

**SDKs and gateway** will ship in dedicated repos as the project progresses:

| Repo | Status | Description |
|------|--------|-------------|
| `atp-protocol` | **Active** | Spec, schemas, docs |
| `atp-sdk-ts` | Planned | TypeScript SDK (`@atp-protocol/sdk` on npm) |
| `atp-sdk-python` | Planned | Python SDK (`atp-protocol` on PyPI) |
| `atp-gateway` | Planned | Reference gateway implementation |

## Conformance levels

ATP is designed as a layered standard. Adoption does not have to be all-or-nothing.

| Level | What it means |
|-------|---------------|
| **ATP-Aware** | System understands ATP contracts and governance metadata |
| **ATP-Compatible** | System evaluates ATP policies and participates in governed execution flows |
| **ATP-Verified** | System passes the published conformance suite |
| **ATP-Attested** | System produces verifiable evidence anchored through DUAL's attestation layer |

## The DUAL relationship

ATP is the governance layer of DUAL, opened up for ecosystem adoption.

The protocol, SDKs, reference gateway, and conformance suite are free and open source under Apache 2.0. Developers can run ATP locally at zero cost.

DUAL provides the production-grade trust substrate: wallet-bound identity, organization primitives, object state, action provenance, and durable attestation. ATP reaches its intended form when running on DUAL.

Open source gives ATP reach. DUAL gives ATP depth.

## Status

This project is in **Draft** status. The spec is under active development.

- [x] Protocol positioning and strategy
- [x] Core contract schema
- [ ] Full protocol specification (v1 draft)
- [ ] TypeScript SDK
- [ ] Python SDK
- [ ] Reference gateway
- [ ] Conformance suite

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

ATP uses an RFC process for spec evolution. Proposed changes start as GitHub issues, progress to formal RFCs, and are reviewed by core maintainers.

## License

Apache 2.0 — see [LICENSE](LICENSE) for details.

The protocol specification is licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

---

**ATP is a project of [DUAL](https://dual.network).** Built for a world where agent actions need more than prompts and logs. They need a trust substrate.
