# Contributing to ATP

Thank you for your interest in contributing to the Agent Trust Protocol.

## How to contribute

### Reporting issues

Open a GitHub issue for bugs, questions, or feature requests. Please include enough context for others to understand and reproduce the problem.

### Proposing spec changes

ATP uses an RFC process for protocol evolution.

1. **Open a discussion issue** describing the problem and your proposed approach.
2. **Draft an RFC** using the template in `spec/rfcs/0000-template.md`.
3. **Submit a pull request** with your RFC in the `spec/rfcs/` directory.
4. **Review period** — 14 days for community feedback.
5. **Decision** — core maintainers accept, reject, or request revisions.

Small clarifications and typo fixes can go directly to a PR without the RFC process.

### Contributing code

For SDK or gateway contributions (once those repos exist):

1. Fork the repository.
2. Create a feature branch from `main`.
3. Write tests for your changes.
4. Ensure all tests pass.
5. Submit a pull request with a clear description of what changed and why.

### Style guidelines

- Protocol spec uses plain, direct language. Avoid jargon where possible.
- Code examples should be minimal and self-contained.
- JSON schemas follow Draft 2020-12.

## Code of conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you agree to uphold its terms.

## License

By contributing, you agree that your contributions will be licensed under the Apache 2.0 license (code) or CC BY 4.0 (spec content).
