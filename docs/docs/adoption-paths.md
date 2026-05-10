---
sidebar_position: 4
---

# Adoption Paths

ATP adoption should start with one consequential action, not a platform rewrite.

## Path 1: MCP Tool Governance

Use when an agent already calls MCP tools.

**First action:** wrap one write-capable MCP tool with `atpGovern`.

**Proof target:**
- one allowed execution;
- one denied execution;
- evidence for both;
- clear policy reason for the denial.

**Good starter tools:**
- send an email;
- create a ticket;
- update a CRM record;
- trigger a deployment preview;
- read a sensitive inventory table.

## Path 2: Enterprise Approval Gate

Use when an agent can take actions that need human accountability.

**First action:** add an ATP contract with an approval threshold.

**Proof target:**
- action under threshold executes;
- action above threshold becomes pending;
- approval state is bound to the exact scope of the requested action;
- evidence records both the request and decision path.

**Good starter tools:**
- approve a payment;
- change access permissions;
- send external procurement correspondence;
- modify production configuration.

## Path 3: Conformance-First Gateway

Use when a team is building its own gateway or policy engine.

**First action:** implement the `ConformanceTarget` interface.

**Proof target:**
- pass Aware fixtures for contract parsing;
- pass Compatible fixtures for policy and approval;
- publish a report with version, tested date, and level achieved.

## Path 4: External Attestation

Use when audit evidence must be independently verifiable.

**First action:** connect an evidence backend that anchors records outside the gateway.

**Proof target:**
- evidence is recorded locally;
- evidence is anchored externally;
- the anchor can be verified later from the evidence ID;
- failed anchoring is fail-closed or explicitly marked as degraded.

## Design partner intake

A strong design partner candidate can answer these questions:

| Question | Required answer |
|----------|-----------------|
| Which agent action is consequential? | A specific tool/action, not a broad workflow |
| What can go wrong? | At least one policy failure and one approval case |
| Who has authority? | Named role, group, service account, or wallet |
| Which credential is used? | Provider, scope, injection method, and fail-closed behavior |
| What evidence matters later? | Fields an auditor or operator would need |

Use the GitHub issue template "Design partner candidate" to propose a first integration.

Use [Design Partner Evidence](./design-partner-evidence.md) for the case-note format once a proof run exists.
