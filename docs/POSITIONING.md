# ATP: The Open Governance Protocol for Agent Execution on DUAL

**Govern the action. Prove it happened.**

---

## ATP in one sentence

ATP is the open governance protocol for AI agent execution, designed to run natively on DUAL for authority, identity, evidence, and attestation.

It gives developers and enterprises a standard way to govern how agents request authority, access tools, use credentials, obtain approvals, execute actions, and produce verifiable evidence of what happened.

ATP is built for a world where agent actions need more than prompts and logs. They need a trust substrate.

DUAL is that substrate.

---

## Why this matters now

AI agents are moving from chat interfaces into operational systems.

They are drafting emails, touching customer records, calling internal APIs, moving money, modifying infrastructure, retrieving sensitive data, and triggering downstream workflows. Tool use is no longer experimental. It is becoming operational.

But operational agent systems do not fail because the model cannot call a tool. They fail because nobody can answer the harder questions with confidence:

* who the agent was acting for
* what authority it actually had
* which credential path was used
* whether approval was genuinely bound to the exact action executed
* how state changed across systems
* what evidence exists when something goes wrong

Those are governance questions.

And governance gets much stronger when it is anchored to durable identity, durable state, and durable evidence rather than ephemeral middleware decisions.

That is why ATP is not merely integrated with DUAL. It is the governance layer of DUAL, opened up for ecosystem adoption.

DUAL provides the native trust substrate ATP needs for production-grade agent execution:

* wallet-bound identity
* organization and role primitives
* object state and lifecycle tracking
* action execution and provenance
* durable evidence and attestation

ATP is the governance protocol. DUAL is the network where that governance becomes durable, attributable, and provable.

There is also a timing dimension.

The agent governance standard has not been set yet. Model providers are building agent infrastructure. Framework teams are adding their own governance patterns. Enterprise platforms are experimenting with policy layers. But no one has published a credible, open, production-grade protocol for governed agent execution.

That window will not stay open indefinitely.

The team that publishes a clear spec, ships reference implementations, and earns early adoption from framework and platform teams will define the governance model for the next generation of agent systems.

ATP is a serious bid to be that standard.

---

## What ATP is

ATP is an open protocol for governed agent execution.

It standardizes how authority, policy, approval, credential access, execution controls, and evidence should work when AI agents take real actions.

ATP is not another agent framework. It is not just a thin proxy. It is not a generic safety wrapper.

It is the governance layer for consequential agent actions — and it is the governance layer of DUAL.

That distinction matters. ATP is not a portable abstraction floating above any substrate. It is strongest — and reaches its intended form — when running on DUAL. That is because the strongest form of agent governance is not merely checking rules before a tool call. It is binding authority, execution, state transition, and evidence to durable network primitives.

Those primitives are what DUAL provides.

---

## The first wedge

ATP is not trying to solve every agent problem at once.

The first and most urgent wedge is this: governing high-consequence tool execution.

That includes cases such as:

* an agent sending an email on behalf of a user or company
* an agent approving or initiating a financial or procurement action
* an agent accessing sensitive internal systems through delegated credentials
* an agent modifying production infrastructure or customer data
* an agent executing regulated or policy-constrained workflows

These are the deployments where "just let the agent call the tool" breaks down fastest.

They are also the deployments where budget, urgency, and governance requirements already exist.

That makes them the right starting point.

---

## ATP and MCP

MCP (Model Context Protocol) is becoming the standard way agents discover and call tools. ATP does not compete with MCP. It governs it.

When an agent calls an MCP tool today, the execution path is simple:

```
Agent → MCP tool call → Tool executes → Result returned
```

There is no authority check. No approval gate. No credential governance. No evidence trail. The agent calls the tool, the tool runs, and whatever happens, happens.

ATP adds the governance layer:

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

MCP defines how an agent calls a tool. ATP defines whether that call should happen, under what authority, with whose approval, using which credentials, and what evidence is produced afterward.

In practice, ATP ships as MCP middleware. A developer wraps their existing MCP tools with ATP governance:

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

The tool itself does not change. The governance wraps it.

This is why ATP is not another agent framework. Frameworks orchestrate tool use. ATP governs it. They compose naturally.

---

## The practical job ATP does

When an agent wants to do something meaningful, ATP standardizes the governed execution path.

```
┌─────────────────────────────────────────────────────────────────┐
│                        AGENT RUNTIME                            │
│                                                                 │
│  Agent decides to take an action                                │
│  (send email, call API, modify record, execute transaction)     │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                     ATP GOVERNANCE LAYER                        │
│                                                                 │
│  ┌─────────────┐   ┌─────────────┐   ┌──────────────────┐     │
│  │  AUTHORITY   │   │  APPROVAL   │   │   CREDENTIAL     │     │
│  │  CHECK       │──▶│  GATE       │──▶│   INJECTION      │     │
│  │              │   │             │   │                  │     │
│  │ wallet       │   │ required?   │   │ scoped access    │     │
│  │ org + role   │   │ bound to    │   │ fail-closed      │     │
│  │ policy eval  │   │ exact action│   │ agent never sees │     │
│  └──────┬───────┘   └──────┬──────┘   └────────┬─────────┘     │
│         │                  │                    │               │
│     deny ← NO         deny ← TIMEOUT       deny ← FAIL        │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                  EXECUTION CONTROL                        │  │
│  │                                                           │  │
│  │  ATP mediates the action with injected credentials        │  │
│  │  Handles: success / failure / timeout / partial / unknown │  │
│  └─────────────────────────┬─────────────────────────────────┘  │
│                             │                                    │
│  ┌──────────────────────────▼────────────────────────────────┐  │
│  │                  EVIDENCE CAPTURE                          │  │
│  │                                                            │  │
│  │  who requested · who approved · what executed              │  │
│  │  which credential path · what state changed                │  │
│  │  what the outcome was · when it happened                   │  │
│  └─────────────────────────┬──────────────────────────────────┘  │
└─────────────────────────────┼────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      DUAL NETWORK                               │
│                                                                 │
│  wallet-bound identity · organization primitives                │
│  object state transitions · action provenance                   │
│  durable evidence · cryptographic attestation                   │
└─────────────────────────────────────────────────────────────────┘
```

At every gate, the default is deny. ATP is fail-closed by design. If authority cannot be verified, the action does not execute. If approval times out, the action does not execute. If credential injection fails, the action does not execute. If evidence cannot be captured, the action is flagged.

This is not optional safety layering. It is the execution model.

---

## What an ATP contract looks like

This is a real ATP execution contract. An enterprise procurement agent wants to send a purchase order email on behalf of a department head.

```json
{
  "version": "1.0.0",
  "authority": "org.procurement.send-email",
  "template": "tpl_purchase_order_comms",
  "actions": ["send-email"],
  "scope": {
    "recipient_domain": ["@approved-vendors.com", "@internal.company.com"],
    "max_attachments": 3,
    "prohibited_content": ["payment instructions", "wire transfer"]
  },
  "approval": {
    "required": true,
    "required_above": null,
    "approver_role": "procurement_manager",
    "timeout": "PT4H",
    "escalation_path": "department_head,cfo"
  },
  "credentials": {
    "provider": "gmail-api",
    "scope": ["send"],
    "inject_as": "oauth_token",
    "fail_closed": true
  },
  "output": {
    "object_type": "procurement_communication",
    "initial_state": "sent",
    "schema_ref": "schemas/procurement-email-v1.json"
  },
  "attestation": "full",
  "revocable": true,
  "expiry": "2026-07-11T00:00:00Z"
}
```

What this contract declares:

**Authority.** This agent can only invoke actions under `org.procurement.send-email`. That authority is scoped to the procurement organization. If the agent tries to call a different action or operate in a different org context, ATP denies it before anything happens.

**Scope constraints.** The agent can only email approved vendor domains or internal addresses. It cannot include payment instructions in the body. These are not prompt guidelines. They are enforceable policy constraints evaluated before execution.

**Approval.** Every send requires approval from a `procurement_manager`. If no response within 4 hours, ATP escalates to `department_head`, then `cfo`. If all escalations exhaust, the action is denied. The approval binds to this exact contract, this exact scope, this exact action. It cannot be reused for a different email or a different recipient.

**Credentials.** The Gmail OAuth token is injected by ATP at execution time. The agent never sees the raw credential. If credential injection fails for any reason, the action is denied. Fail-closed.

**Evidence.** After execution, ATP records a full attestation: who requested it, who approved it, what was sent, which credential path was used, and the resulting object state. On DUAL, this becomes durable, cryptographically signed, and independently verifiable.

That is what governed execution looks like.

---

## What ATP standardizes

ATP standardizes the objects and flow around governed execution.

Core areas include:

* execution contracts
* authority checks
* policy evaluation
* approval state transitions
* credential brokerage and scope control
* action execution semantics
* evidence capture
* attestation hooks

This gives frameworks, gateways, and enterprise platforms a common control model instead of bespoke governance logic in every deployment.

---

## Design principles

ATP is built around a few hard rules.

**1. Open protocol, not closed product.** The protocol must be inspectable, implementable, and extensible. Governance cannot become a black box.

**2. Useful before full attestation.** Developers should get value from ATP locally and early: contracts, policy checks, approval flows, and execution controls should work before full production integration with DUAL.

**3. Exact approval binding.** Approvals should not be vague permissions floating around a system. They must bind to the exact action, scope, and conditions that were approved.

**4. Credentials are governed inputs, not hidden magic.** Credential access must be scoped, attributable, and fail-closed.

**5. Unknown outcomes are first-class.** Real systems time out, partially fail, and return ambiguous responses. ATP treats these as protocol concerns, not edge-case afterthoughts.

**6. Evidence matters.** A production-grade agent system needs a defensible record of what was requested, approved, executed, denied, retried, or left unresolved.

---

## Operational semantics

A governance protocol that only handles the happy path is not a governance protocol. These are the operational behaviors ATP standardizes.

### Sync and async approvals

ATP supports both synchronous and asynchronous approval flows.

In synchronous mode, the agent blocks until the approval resolves. This suits low-latency scenarios where an approver is available and the action is time-sensitive.

In asynchronous mode, the agent submits an approval request and receives a pending reference. The agent (or a separate polling mechanism) checks the approval status later. This suits scenarios where human reviewers may take minutes or hours.

The protocol does not prefer one mode. The contract declares which applies. The gateway enforces it.

### Timeout behavior

Every approval has an explicit timeout declared in the contract as an ISO 8601 duration. When a timeout fires:

1. The approval transitions to `expired`.
2. If an escalation path is defined, ATP promotes the request to the next role in the chain.
3. If all escalation targets exhaust without resolution, the action is denied.
4. A timeout event is recorded in the evidence trail.
5. The agent receives a terminal `denied:timeout` status.

There is no implicit timeout. If the contract does not declare one, approval blocks indefinitely. That is a design choice, not an oversight. Governance should not silently expire.

### Unknown outcome handling

When ATP mediates an action and the downstream system returns an ambiguous result (a 202 with no confirmation, a network timeout after partial write, a response that does not clearly indicate success or failure), the protocol treats this as a first-class state.

The execution record transitions to `outcome:unknown`. ATP does not retry automatically. It does not assume success. It does not assume failure.

Instead:

1. The unknown outcome is recorded in the evidence ledger with full context (request sent, response received or not, timing, credential path used).
2. The agent receives an `outcome:unknown` status with a resolution reference.
3. Resolution is handled through an explicit reconciliation flow: either a human reviews the downstream system, or an automated check confirms the final state.
4. Until resolved, the action is treated as potentially executed for idempotency purposes.

This matters because the worst governance failure is not a denied action. It is an action that might have happened, with no reliable record of whether it did.

### Idempotency

ATP assigns every execution request an idempotency key. If the same request is submitted twice (due to agent retry, network failure, or duplicate invocation), the gateway recognizes the duplicate and returns the existing execution record without re-executing.

Idempotency is enforced at the gateway, not the downstream tool. This means ATP provides replay safety even when the underlying tool does not.

For actions where downstream side effects are not naturally idempotent (sending an email, initiating a payment), the idempotency key prevents ATP from re-invoking the tool. It does not guarantee the tool itself handles duplicates. That distinction is documented in the contract via an `idempotency` field that declares whether the downstream action is inherently safe to retry.

### Evidence write failures

If ATP successfully executes an action but fails to write the evidence record (network partition to DUAL, transient write failure, storage exhaustion), the protocol does not silently proceed.

The execution is flagged as `evidence:pending`. The evidence payload is retained locally at the gateway. A background reconciliation process retries the write. Until the evidence is durably recorded, the action is marked as unattested.

An unattested action is not the same as an unrecorded one. The execution happened. The local record exists. But the durable, cryptographically signed, independently verifiable attestation on DUAL has not yet been confirmed.

Systems that require ATP-Attested conformance treat `evidence:pending` as a degraded state that must resolve before downstream processes can trust the execution record.

### Revocation

ATP contracts can be declared `revocable`. When a contract is revoked:

1. All pending approvals under that contract are immediately invalidated.
2. No new execution requests are accepted against that contract.
3. Previously completed executions and their evidence records are unaffected. Revocation is not retroactive.
4. The revocation event itself is recorded in the evidence ledger.

Revocation can be triggered by the issuing organization, an authorized role in the delegation chain, or by contract expiry.

Revocation solves the stale delegation problem: when an employee leaves, when a project ends, when a vendor relationship terminates. The agent loses authority immediately, not when someone remembers to update an access list.

---

## ATP conformance model

To make adoption practical, ATP is designed as a layered standard.

**ATP-Aware.** A system understands ATP contracts and can interpret ATP governance metadata.

**ATP-Compatible.** A system can evaluate ATP policies and participate correctly in ATP-governed execution flows.

**ATP-Verified.** A system has implemented the required protocol behaviors correctly enough to pass a published conformance suite.

**ATP-Attested.** A system produces verifiable evidence anchored through DUAL's attestation layer for production-grade auditability.

This matters because adoption does not have to be all-or-nothing.

A developer can start ATP-Aware. A platform can become ATP-Compatible. A commercial gateway can pursue ATP-Verified. Regulated or high-trust deployments can use ATP-Attested.

That is how standards spread.

---

## The DUAL relationship

ATP is the governance layer of DUAL, opened up for ecosystem adoption.

That is a deliberate product thesis, not an afterthought.

DUAL already provides the primitives ATP needs to make governed execution durable and production-grade:

* identity through wallets
* delegated control through organizations and roles
* governed state through objects
* explicit mutation paths through actions
* traceability through provenance
* durable evidence and attestation through the network layer

ATP defines the governance contract: what authority is being asserted, what action is being requested, what policy applies, whether approval is required, what credential scope is allowed, what evidence must exist afterward.

DUAL provides the execution trust substrate: who is acting, what they can control, how governed objects change state, how actions are recorded, how provenance is preserved, how attestations become durable and portable.

ATP is open because governance standards need adoption. But ATP does not pretend to be neutral about where it is strongest. ATP reaches its intended form when run on DUAL. That is the design, and it is honest about being the design.

---

## Economics

The ATP protocol specification, SDKs, reference gateway, documentation, and conformance suite are free and open source under Apache 2.0.

Developers can run ATP locally and in their own infrastructure at zero cost. Policy checks, approval flows, contract validation, credential brokerage, and execution controls all work without touching the DUAL network.

DUAL-backed attestation is consumption-based and applies when you need durable, network-anchored evidence and identity. Pricing follows usage and scales with the volume of governed executions that require production-grade attestation.

The model is straightforward: use ATP freely in development and governed integration. Pay for DUAL when you need the attestation layer that makes governed execution durable and provable.

The open layers are genuinely useful on their own. The DUAL layers add production trust that open source infrastructure alone cannot provide — because durable identity, immutable evidence, and cryptographic attestation require a network, not just a library.

---

## Failure handling is part of the protocol

This matters more than most teams think.

Governed execution fails in real life for boring reasons:

* a downstream API times out
* a provider returns a 202 and never confirms the final state
* a human approval arrives after a timeout window
* a retry risks duplicating an external side effect
* a credential expires mid-flow
* an action partially completes across systems

ATP treats these as first-class protocol concerns.

A serious governed execution standard needs explicit behavior for:

* allow / deny / pending / expired / unknown states
* idempotency and replay handling
* approval expiry and revocation
* partial execution records
* unknown-outcome escalation paths
* fail-closed credential access
* evidence retention for unresolved actions

If those behaviors are not standardized, governance collapses under real operating conditions.

The operational semantics section of this document specifies how ATP handles each of these cases. They are not deferred to implementers. They are part of the protocol.

---

## What makes ATP different

There are already tools in this space, but most solve only fragments of the problem.

**Compared with agent frameworks.** Agent frameworks orchestrate model behavior and tool use. ATP governs whether consequential actions should happen, under what authority, with which approvals, with what credential path, and with what evidence.

**Compared with generic policy engines.** Policy engines can evaluate rules. ATP defines the full governed execution model around those rules: authority assertions, approval binding, credential handling, execution semantics, evidence capture, and attestation.

**Compared with model-provider guardrails.** Model-provider controls can reduce unsafe behavior, but they do not create portable, system-level governance for real-world actions across enterprise tools and workflows.

**Compared with simple proxies or logging layers.** A proxy can sit in the path. A logger can record the aftermath. ATP defines the governed action itself.

**Compared with ATP on a non-native substrate.** ATP can be understood anywhere. But DUAL gives ATP stronger semantics than a generic implementation can offer because DUAL provides native identity, object state, action execution, provenance, and attestation as first-class primitives. That is the key distinction. On DUAL, ATP is not just software wrapping agent calls. It is a protocol plus a trust substrate.

---

## Who ATP is for

ATP on DUAL is built for three groups first.

**1. Platform teams building serious agent infrastructure.** They need a standard way to govern high-risk actions across multiple agents, tools, and internal systems, with durable identity and evidence behind each decision.

**2. Enterprises deploying agents into consequential workflows.** They need more than observability. They need attributable authority, approval controls, credential discipline, and provable execution records.

**3. Developers and partners building on DUAL.** They need a native governance layer that makes DUAL more than a settlement network. ATP turns DUAL into the trust and control substrate for agentic systems.

That third audience matters most.

The strongest version of ATP is not merely a public standard that happens to connect to DUAL. It is a protocol that makes DUAL the obvious place to build governed agent execution.

---

## What adoption should look like

A good protocol wins because it is easy to start and hard to replace.

**Step 1: local development.** A developer installs an SDK, defines an execution contract, runs local policy checks, and gates a tool call.

**Step 2: governed integration.** A team adds ATP middleware to MCP tools, internal APIs, or agent runtimes to standardize approval and execution flows.

**Step 3: production trust.** A platform adopts ATP-backed evidence and attestation on DUAL for higher-trust, higher-stakes deployments.

This path matters. It reduces friction up front while preserving a credible path to stronger trust later.

---

## Initial protocol surface

A practical v1 should stay focused.

The initial ATP surface should prioritize:

* authority check
* execution request
* approval request and resolution
* credential access control
* execution status
* evidence retrieval
* attestation retrieval

That is enough to make ATP real without turning v1 into a sprawling standards exercise.

---

## Reference implementation philosophy

ATP needs more than a PDF.

A protocol without a credible implementation path does not become a standard.

That is why ATP should ship with:

* a clear written specification
* canonical schemas
* TypeScript and Python SDKs
* a reference gateway
* example integrations
* a conformance test suite

The reference gateway matters because it shows ATP operating under real conditions: policy checks, approval binding, credential brokerage, execution mediation, evidence capture, and attestation hooks.

It should not be treated as a toy demo. It is the proof that the protocol can govern real execution paths.

---

## What success looks like

ATP succeeds if it becomes the default governance model for consequential agent execution on DUAL, and the broader open standard others recognize and integrate with.

That would look like:

* DUAL-based applications adopting ATP for governed actions by default
* framework teams integrating ATP-aware middleware and DUAL-backed execution trust
* enterprises using ATP on DUAL to gate sensitive actions and prove what happened
* gateways and platforms advertising ATP compatibility
* ATP-Verified implementations emerging across the ecosystem
* ATP-Attested deployments on DUAL becoming a recognizable trust signal

The ambition is not vague.

When an agent takes a consequential action on DUAL, ATP should be the standard way that action is governed, executed, and proven.

---

## Why open source is the right strategy

A proprietary governance layer will struggle to become infrastructure.

If ATP is meant to shape how agent execution is governed across frameworks, enterprises, gateways, and ecosystems, the protocol must be legible and inspectable. Teams need to understand how authority is asserted, how approvals bind, how credential access is constrained, and what evidence guarantees actually mean.

That only works if the protocol is open.

But ATP is not open in a way that hides its core product thesis.

The thesis is this: the protocol is open so it can spread. DUAL is the native network where ATP becomes durable, attributable, and production-grade.

Open source gives ATP reach. DUAL gives ATP depth.

---

## Near-term roadmap

**Phase 1.** Publish the ATP specification draft. Publish canonical schemas. Launch a public documentation site.

**Phase 2.** Release TypeScript and Python SDKs. Ship quick-start examples for governed tool execution. Publish conformance targets for ATP-Aware and ATP-Compatible implementations.

**Phase 3.** Release a reference gateway. Ship MCP and API middleware integrations. Publish a conformance suite for ATP-Verified implementations.

**Phase 4.** Support early design partners. Harden attestation-backed production deployments. Expand ecosystem integrations and trust signaling.

The key is to publish early, keep v1 focused, and let adoption pressure shape the next layer of the protocol.

---

## What happens next

The market does not need another vague "agent safety" narrative.

It needs a practical standard for governed execution.

ATP is a serious attempt to provide one.

If AI agents are going to operate inside real systems, touching real tools, with real consequences, then governance cannot remain an afterthought.

It needs its own protocol layer.

ATP is that layer.

---

**Govern the action. Prove it happened.**

ATP is the open protocol for governing how AI agents request authority, obtain approval, access credentials, execute actions, and produce verifiable evidence on DUAL.
