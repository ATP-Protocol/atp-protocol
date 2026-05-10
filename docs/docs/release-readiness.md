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

## First release sequence

1. Confirm CI is green on `main`.
2. Run the MCP proof demo from a fresh checkout.
3. Run SDK and gateway tests locally.
4. Create a release candidate tag.
5. Publish npm packages.
6. Publish the Python package.
7. Install the published packages into a clean temp project.
8. Run a minimal governed tool example against the published SDK.
9. Publish release notes with conformance level support.

## Current public-preview status

ATP currently has:

- protocol spec and schemas;
- TypeScript and Python SDKs;
- reference gateway;
- conformance fixtures and runner;
- MCP server;
- local proof demo;
- CI and publish workflows.

ATP still needs before a 9.8 public readiness claim:

- first npm/PyPI package publication;
- a recorded proof demo output;
- first external conformance report;
- at least two design partner integration notes;
- marketplace listing or install path for the MCP server.
