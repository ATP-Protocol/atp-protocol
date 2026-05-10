---
sidebar_position: 1
---

# Conformance Testing

ATP conformance gives implementers a shared way to prove what their gateway supports.

The suite is in this repo under `conformance/`. It contains portable JSON fixtures plus a TypeScript runner. Implementations can consume the fixtures in any language or implement the TypeScript `ConformanceTarget` interface.

## Levels

| Level | Name | Meaning |
|-------|------|---------|
| 1 | Aware | Parses and validates ATP contracts |
| 2 | Compatible | Evaluates policy and approval state machines |
| 3 | Verified | Captures evidence, computes idempotency, and classifies outcomes |
| 4 | Attested | Anchors evidence through an external attestation backend |

Levels are cumulative. A Verified implementation must also pass Aware and Compatible tests.

## Run the reference suite

```bash
cd conformance
npm install
npm run build
npm test
```

## Use the runner

```typescript
import { runConformanceTests } from "@atp-protocol/conformance";
import { MyGateway } from "./my-gateway";

const report = await runConformanceTests(new MyGateway(), "my-gateway");

console.log(report.level_achieved);
console.log(report.results);
```

## Use fixtures directly

Fixtures are JSON files in `conformance/src/fixtures/`:

- `contracts.json`
- `policy.json`
- `approval.json`
- `evidence.json`
- `idempotency.json`
- `outcome.json`

Any implementation can load those fixtures and compare its outputs with the expected results.

## Public report

A useful public conformance report should include:

- implementation name and version;
- ATP spec version;
- conformance suite version;
- tested date;
- level achieved;
- number of passing/failing tests by level;
- any skipped capabilities and why.

Use the GitHub issue template "Conformance report" to submit an implementation report.
