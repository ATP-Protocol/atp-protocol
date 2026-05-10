---
sidebar_position: 3
---

# 5-Minute Proof Demo

This is the fastest way to evaluate ATP without trusting a slide deck or roadmap.

## Run it

```bash
git clone https://github.com/ATP-Protocol/atp-protocol.git
cd atp-protocol/examples/mcp-demo
npm install
npm run demo
```

For a strict, machine-readable proof run:

```bash
npm run proof
```

This exits non-zero if any expected outcome fails and writes `proof/latest-demo-report.json`.

## What must appear

The demo should show all six scenarios:

| Scenario | Expected result | Gate proven |
|----------|-----------------|-------------|
| Send email to approved vendor | Success | Authority, policy, approval, credential injection, evidence |
| Send email to unauthorized domain | Denied | Domain policy fail-closed |
| Send email with prohibited content | Denied | Content policy fail-closed |
| Read inventory | Success | Lightweight read-only governance |
| Approve $5,000 payment | Success | Threshold policy below approval limit |
| Approve $25,000 payment | Pending | Approval gate before high-risk execution |

## What this proves

The demo proves the local governance loop:

```text
MCP request
  -> authority check
  -> policy evaluation
  -> approval decision
  -> credential resolution
  -> mediated execution
  -> evidence record
```

The tool handlers are mock handlers. The governance path is real: contracts are loaded, policies are evaluated, credentials are resolved, approval states are computed, and evidence records are generated.

The repo also includes a committed reference report at `examples/mcp-demo/proof/reference-demo-report.json`. Use it as the expected output shape for CI, demos, and design-partner evaluations.

## Passing criteria

An evaluator can treat the demo as passed when:

- all six scenarios complete without an unhandled exception;
- denial scenarios stop before execution;
- pending approval scenarios stop before execution;
- all scenarios record evidence IDs;
- credentials are never printed as raw secrets;
- the result explains which governance gate decided the outcome.

## Next proof step

Replace one mock tool handler with a real internal or sandboxed API call. Keep the same contract and gateway pipeline. A strong first integration includes:

- one low-risk read operation;
- one medium-risk write operation with constraints;
- one high-risk operation requiring approval;
- evidence records for success, denial, and pending approval.
