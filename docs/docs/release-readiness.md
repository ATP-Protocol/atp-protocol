---
sidebar_position: 5
---

# Release Readiness

This checklist defines what must be true before ATP is called release-ready rather than public-preview ready.

## Package release gates

| Gate | Required state |
|------|----------------|
| Versioning | All packages use the same release version or a documented compatibility matrix |
| CI | TypeScript SDK, Python SDK, gateway, conformance, and schema jobs pass on `main` |
| Build artifacts | npm packages build both CJS and ESM where applicable |
| Provenance | npm publish uses provenance; PyPI publish uses a configured token or trusted publisher |
| Docs | README and docs quick start match the published package APIs |
| Changelog | Release notes list protocol, SDK, gateway, and conformance changes |
| Smoke test | Fresh install can run the 5-minute proof path |
| Proof artifact | CI uploads a strict MCP demo proof report |
| Conformance artifact | CI uploads a reference conformance report |
| MCP package | MCP server typechecks, builds, dry-runs package contents, and publishes after SDK/gateway |

## First release sequence

1. Confirm CI is green on `main`.
2. Run the MCP proof demo from a fresh checkout.
3. Run SDK and gateway tests locally.
4. Create a release candidate tag.
5. Publish npm packages.
6. Publish the Python package.
7. Publish the MCP server after SDK and gateway are available.
8. Install the published packages into a clean temp project.
9. Run a minimal governed tool example against the published SDK.
10. Publish release notes with conformance level support.

## Current public-preview status

ATP currently has:

- protocol spec and schemas;
- TypeScript and Python SDKs;
- reference gateway;
- conformance fixtures and runner;
- MCP server;
- strict local proof demo with committed reference report;
- reference conformance report generation path;
- MCP install path and listing draft;
- MCP package build/dry-run and publish workflow coverage;
- design partner evidence template;
- CI and publish workflows.

ATP still needs before a 9.8-proven public claim:

- first npm/PyPI package publication;
- first external conformance report;
- at least two design partner integration notes;
- marketplace listing submission/acceptance for the MCP server.

## 9.8 readiness evidence

| Evidence | Repo path |
|----------|-----------|
| Strict proof command | `examples/mcp-demo/package.json` (`npm run proof`) |
| Reference proof report | `examples/mcp-demo/proof/reference-demo-report.json` |
| CI proof artifact | `.github/workflows/ci.yml` (`mcp-demo-proof-report`) |
| Reference conformance artifact | `.github/workflows/ci.yml` (`reference-conformance-report`) |
| External report intake | `.github/ISSUE_TEMPLATE/conformance-report.yml` |
| Design partner intake | `.github/ISSUE_TEMPLATE/design-partner.yml` |
| Design partner case-note format | `docs/docs/design-partner-evidence.md` |
| MCP listing draft | `mcp-server/marketplace-listing.json` |
| MCP package dry-run | `.github/workflows/ci.yml` (`MCP Server Package`) |
| MCP publish job | `.github/workflows/publish.yml` (`publish-mcp-server`) |
