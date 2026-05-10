---
sidebar_position: 4
---

# Conformance Reports

ATP does not require a central registry to start proving conformance. A report is enough for early implementations, as long as it is specific and reproducible.

## Minimum report

```json
{
  "implementation": "example-gateway",
  "implementation_version": "0.3.0",
  "atp_spec_version": "1.0.0-draft.2",
  "conformance_suite_version": "0.1.0",
  "tested_at": "2026-05-11T00:00:00Z",
  "level_achieved": "verified",
  "results": {
    "aware": { "passed": 12, "failed": 0 },
    "compatible": { "passed": 23, "failed": 0 },
    "verified": { "passed": 25, "failed": 0 },
    "attested": { "passed": 0, "failed": 0, "skipped": "no external attestation backend configured" }
  }
}
```

## Report quality gates

- The implementation version must be immutable.
- The ATP spec version must be named.
- The conformance suite version must be named.
- Skipped tests must include a reason.
- Claims must use the highest fully passed level, not the highest attempted level.
- Attested claims must include the external anchor verification path.

## Publishing a report

For now, publish reports as:

- a GitHub issue using the "Conformance report" template;
- a file in the implementation repository;
- or release notes attached to a gateway release.

When a public ATP registry is available, reports can be promoted into registry entries.
