# @atp-protocol/registry

ATP Contract Registry — publish, discover, and resolve governance contracts for the Agent Trust Protocol.

## Installation

```bash
npm install @atp-protocol/registry @atp-protocol/sdk
```

## Quick Start

```typescript
import { ContractRegistry } from "@atp-protocol/registry";
import { LocalRegistryBackend } from "@atp-protocol/registry";

// Create a registry with local file-based storage
const backend = new LocalRegistryBackend("./contracts");
const registry = new ContractRegistry(backend);

// Register a governance contract
await registry.register({
  id: "my-contract-v1",
  name: "My Governance Contract",
  version: "1.0.0",
  schema: {
    // Your governance schema
  }
});

// Resolve a contract
const contract = await registry.resolve("my-contract-v1");
```

## Documentation

For full documentation and examples, see the [ATP Protocol repository](https://github.com/ATP-Protocol/atp-protocol).

## License

Apache-2.0
