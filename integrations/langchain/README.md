# @atp-protocol/langchain

ATP governance adapter for LangChain — wrap any LangChain tool with agent trust governance.

## Installation

```bash
npm install @atp-protocol/langchain @atp-protocol/sdk @langchain/core
```

Note: `@langchain/core` is a peer dependency.

## Quick Start

```typescript
import { governTool } from "@atp-protocol/langchain";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { ContractRegistry } from "@atp-protocol/sdk";

// Define a LangChain tool
const myTool = new DynamicStructuredTool({
  name: "my_tool",
  description: "A tool that does something",
  schema: z.object({
    input: z.string(),
  }),
  func: async (input) => {
    return `Result: ${input.input}`;
  },
});

// Wrap it with ATP governance
const governance = new ContractRegistry(/* backend */);
const governedTool = await governTool(myTool, governance, {
  contractId: "my-governance-contract",
});

// Use the governed tool with your LangChain agent
// All executions now flow through ATP governance
```

## Documentation

For full documentation and examples, see the [ATP Protocol repository](https://github.com/ATP-Protocol/atp-protocol).

## License

Apache-2.0
