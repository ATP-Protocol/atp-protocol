---
sidebar_position: 1
---

# Introduction to ATP

## What is the Agent Trust Protocol?

The **Agent Trust Protocol (ATP)** is a foundational governance framework for controlling and auditing autonomous agent execution. It solves the critical challenge of allowing AI agents to take meaningful actions—like provisioning infrastructure, moving money, or modifying production systems—while maintaining human oversight and accountability.

Without ATP, you face a dilemma: either lock agents into read-only roles (rendering them ineffective), or grant broad write permissions and hope they stay within guardrails (a dangerous gamble). ATP splits the difference. It lets you define *precisely* what an agent can do, *under what conditions*, *with whose approval*, and *with full evidence of what actually happened*.

ATP is not a sandbox or a permission layer bolted onto your infrastructure. It's a co-designed protocol that sits at the boundary between agent intent and system action. An agent proposes an action, ATP evaluates it against a contract signed by authorized humans, and if it passes all checks, the action executes with cryptographic proof of compliance. Every step is logged, timestamped, and can be durably attested via an external backend.

## The 5-Layer Trust Stack

ATP operates within a broader trust architecture. Understanding where it sits helps you deploy it correctly:

```
┌─────────────────────────────────────┐
│   Layer 1: Identity                 │
│   (Who is the agent? Who authorized │
│    this action? Cryptographic proof)│
└─────────────────────────────────────┘
            ↓
┌─────────────────────────────────────┐
│   Layer 2: Policy                   │
│   (Constraints on action scope,     │
│    rate limits, dollar caps, etc.)  │
└─────────────────────────────────────┘
            ↓
┌─────────────────────────────────────┐
│   Layer 3: ATP Governance           │
│   (Execution contracts, delegation  │
│    authority, approval flows)       │
└─────────────────────────────────────┘
            ↓
┌─────────────────────────────────────┐
│   Layer 4: State Management         │
│   (Transactional semantics, conflict│
│    detection, idempotency)          │
└─────────────────────────────────────┘
            ↓
┌─────────────────────────────────────┐
│   Layer 5: Attestation              │
│   (Evidence generation, audit logs, │
│    external attestation backends)   │
└─────────────────────────────────────┘
```

ATP is **Layer 3**. It depends on layer 1 (identity/crypto), layer 2 (policy constraints), layer 4 (transaction safety), and feeds into layer 5 (proof of execution).

## 6 Core Primitives

ATP is built on six core abstractions:

### 1. **Wallet**
A cryptographic identity representing an agent, user, or organization. A wallet holds signing keys, delegation rules, and audit history. Every actor in ATP has a wallet.

### 2. **Organization**
A security boundary grouping wallets, templates, and policies under a single authority. Organizations can federate (one org can delegate to another).

### 3. **Template**
A reusable contract that defines what action types are allowed, what constraints apply, and what approval flow is required. A template is signed by an organization's authority key.

### 4. **Object**
The entity being acted upon—a cloud resource, a financial account, a database entry, or any system state that the agent wants to modify. Objects are immutable at creation but mutable via governed actions.

### 5. **Action**
An agent's proposal to modify an object. An action includes intent (what to do), context (why, when, where), and a reference to the contract it claims to satisfy. Actions flow through approval, execution, and attestation.

### 6. **Face**
An agent's public presentation—credentials, metadata, and policy enforcement rules bound to a specific deployment. A single wallet can have multiple faces (e.g., one for production, one for staging). Faces make it safe to deploy the same agent code in multiple environments.

## Quick Comparison: Without ATP vs. With ATP

### Without ATP

```
┌──────────────┐
│    Agent     │──── "Delete user #12345"
└──────────────┘
       ↓ (No governance)
┌──────────────────┐
│  User Database   │
│  ✗ Delete user   │
│    (no audit)    │
└──────────────────┘
```

**Problems:**
- Agent can delete any user with no trace
- No way to prove who authorized it
- No approval flow or rate limiting
- Impossible to audit or debug

### With ATP

```
┌──────────────┐
│    Agent     │──── "Delete user #12345"
└──────────────┘
       ↓
┌──────────────────────────────────┐
│  ATP Contract Evaluation         │
│  ✓ Is this action in the policy? │
│  ✓ Do I have approval?           │
│  ✓ Does the user exist?          │
│  ✓ Are rate limits ok?           │
└──────────────────────────────────┘
       ↓ (All gates pass)
┌──────────────────────────────────┐
│  User Database                   │
│  ✓ Delete user                   │
│  ✓ Log proof of authorization    │
└──────────────────────────────────┘
       ↓
┌──────────────────────────────────┐
│  Evidence & Audit Log            │
│  - Timestamp, signer, approval   │
│  - Cryptographically signed      │
│  - Human-readable explanation    │
└──────────────────────────────────┘
```

**Benefits:**
- Agent can only delete users allowed by policy
- Explicit human approval captured and signed
- Full audit trail: who, what, when, why
- Evidence is cryptographically verifiable
- Rate limits and capacity checks enforced

## Core Concepts

### Execution Contract
A JSON document signed by authorized humans that specifies:
- What type of action is allowed (e.g., "delete user")
- What constraints apply (e.g., "only in staging, max 10 deletions per hour")
- What approval is required (e.g., "two humans must sign")
- How evidence is collected (e.g., "log to audit table")

### Authority Model
A delegation chain that answers "who can sign contracts?" Organizations delegate to officers, officers delegate to services, services delegate to agents. Each delegation can be scoped (e.g., "Officer Alice can approve user deletions up to 100 per day, but not more").

### Policy Evaluation
When an action is proposed, ATP checks it against constraints in the contract:
- **Temporal:** Is this action allowed right now? (based on time-of-day, day-of-week rules)
- **Quantitative:** Is the quantity within bounds? (e.g., "max $5000 per transaction")
- **Categorical:** Is the resource type allowed? (e.g., "production databases only")
- **Delegation:** Did the right person (or org) authorize this?
- **Rate limiting:** Have I exceeded the quota for this action?

### Approval State Machine
An action flows through states:
1. **Proposed** — Agent submits the action
2. **Approved** — Required signers sign the contract
3. **Executing** — Gateway runs the action
4. **Attested** — Evidence is generated and signed
5. **Settled** — Evidence is durably attested via external backend (optional)

An action can be escalated if it doesn't match an existing contract (human review required). It can be rejected at any step, and rejection is logged.

### Credential Brokerage
Agents need credentials to access systems (API keys, database passwords, cloud tokens). ATP's credential broker lets agents request credentials at execution time without storing them. The broker fetches, injects, and cleans up credentials automatically—agents never see them.

## Next Steps

- **[Quick Start](./quick-start.md)** — Set up ATP SDK and govern your first MCP tool in 5 minutes
- **[Specification](./spec/overview.md)** — Read the full 14-section spec for comprehensive details
- **[Gateway Documentation](./gateway/overview.md)** — Learn how to deploy and run the ATP reference gateway
- **[SDK Docs](./sdk/typescript.md)** — Integrate ATP into your agent code with TypeScript or Python
- **[Conformance Testing](./conformance/overview.md)** — Certify your implementation against ATP standards
