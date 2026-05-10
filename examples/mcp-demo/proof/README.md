# MCP Demo Proof

This folder contains a committed reference proof report plus a reproducible local proof command.

Run:

```bash
npm run proof
```

The command runs all six ATP governance scenarios in strict mode and writes `proof/latest-demo-report.json`. The latest report is ignored by Git so local proof runs do not create commit noise.

The committed `reference-demo-report.json` shows the expected pass shape:

- 3 successful governed executions;
- 2 policy denials;
- 1 pending approval;
- evidence recorded for every scenario;
- zero expected outcome mismatches.
