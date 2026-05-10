---
sidebar_position: 3
---

# Testing Guide

Use the conformance package when you need to prove an ATP implementation against shared fixtures.

## Run the suite

```bash
cd conformance
npm install
npm run build
npm test
```

This runs the reference conformance tests included in the repo.

## Test fixture groups

| Fixture | Level supported | Purpose |
|---------|-----------------|---------|
| `contracts.json` | ATP-Aware | Contract shape, required fields, attestation, idempotency |
| `policy.json` | ATP-Compatible | Scope constraints and fail-closed policy decisions |
| `approval.json` | ATP-Compatible | Approval state transitions |
| `evidence.json` | ATP-Verified | Evidence record structure |
| `idempotency.json` | ATP-Verified | Deterministic idempotency keys |
| `outcome.json` | ATP-Verified | Execution outcome classification |

## Implement the target interface

```typescript
import type { ConformanceTarget } from "@atp-protocol/conformance";

class MyGateway implements ConformanceTarget {
  validateContract(contract: unknown) {
    return { valid: true, errors: [] };
  }

  evaluatePolicy(contract: object, params: Record<string, unknown>) {
    return { permitted: true };
  }

  transitionApproval(state: string, trigger: string) {
    return { next_state: "APPROVED" };
  }

  captureEvidence(input: object) {
    return {
      evidence_id: "evi_001",
      execution_id: "exe_001",
      request_hash: "sha256:demo",
    };
  }

  computeIdempotencyKey(contractId: string, action: string, params: object) {
    return `${contractId}:${action}:${JSON.stringify(params)}`;
  }

  classifyOutcome(response: { status: number }) {
    return response.status >= 200 && response.status < 300 ? "success" : "failure";
  }
}
```

## Generate a report

```typescript
import { runConformanceTests } from "@atp-protocol/conformance";

const report = await runConformanceTests(new MyGateway(), "my-gateway");

console.log(JSON.stringify(report, null, 2));
```

## Report expectations

A useful report states:

- implementation name and version;
- ATP spec version;
- conformance suite version;
- tested date;
- level achieved;
- passed and failed test counts by level;
- skipped capabilities and reasons.

Use [Conformance Reports](./certification.md) for the public report format.
