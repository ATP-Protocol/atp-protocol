---
sidebar_position: 2
---

# Conformance Levels

## Level 1: ATP-Aware

An ATP-Aware implementation understands ATP contracts and metadata.

**Required capabilities:**

- parse ATP contract JSON;
- validate required fields;
- reject malformed contracts;
- understand attestation level declarations;
- validate idempotency model declarations.

**Use when:** you are adding ATP contract awareness to an existing agent platform or registry.

## Level 2: ATP-Compatible

An ATP-Compatible implementation enforces ATP policy and approval semantics.

**Required capabilities:**

- all ATP-Aware capabilities;
- evaluate contract scope constraints;
- fail closed on unknown actions or unsupported constraints;
- run approval state transitions;
- produce structured denial reasons.

**Use when:** you want a gateway to decide whether an agent action should proceed.

## Level 3: ATP-Verified

An ATP-Verified implementation produces reliable execution evidence.

**Required capabilities:**

- all ATP-Compatible capabilities;
- capture evidence records;
- compute deterministic idempotency keys;
- classify outcomes as success, failure, timeout, partial, denied, or unknown;
- handle evidence write failure explicitly.

**Use when:** operators and auditors need evidence for consequential agent actions.

## Level 4: ATP-Attested

An ATP-Attested implementation anchors evidence through an external attestation backend.

**Required capabilities:**

- all ATP-Verified capabilities;
- anchor evidence externally;
- return verifiable anchor references;
- support cross-organization verification where relevant;
- expose degraded/failed anchoring state clearly.

**Use when:** evidence must survive beyond one gateway, database, or organization.

## Level achievement rules

| Level | Must pass |
|-------|-----------|
| ATP-Aware | Contract fixtures |
| ATP-Compatible | Contract, policy, and approval fixtures |
| ATP-Verified | Contract, policy, approval, evidence, idempotency, and outcome fixtures |
| ATP-Attested | All Verified fixtures plus external anchoring checks |

## Badge language

Until a public registry is live, use text badges in READMEs and reports:

```text
ATP-Conformance: Verified
ATP-Spec: v1.0.0-draft.2
ATP-Conformance-Suite: 0.1.0
Tested: 2026-05-11
```

Do not claim `ATP-Attested` unless evidence anchoring is actually exercised and verifiable.
