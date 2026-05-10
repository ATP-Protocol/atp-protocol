# Conformance Reports

This folder is reserved for public implementation reports.

## Reference report

CI generates a reference implementation report from the TypeScript conformance runner and uploads it as the `reference-conformance-report` artifact.

To generate it locally:

```bash
cd conformance
npm install
npm run build
npm run report:reference > reference-conformance-report.json
```

## External reports

External implementations should submit results through the GitHub issue template "Conformance report" or open a pull request adding a report file here.

Minimum file naming:

```text
<implementation>-<version>-<yyyy-mm-dd>.json
```

Minimum fields:

- implementation name and version;
- ATP spec version;
- conformance suite version;
- tested date;
- level achieved;
- pass/fail counts by level;
- skipped capabilities and limitations;
- link to evidence or CI run where possible.
