# ATP MCP Server Development

Guide for developing, testing, and extending the ATP MCP server.

## Quick Start

```bash
# Install dependencies
npm install

# Build
npm run build

# Run
npm start

# Or run in dev mode (with ts-node)
npm run dev
```

The server listens on stdio and prints "ATP MCP server running on stdio" to stderr when ready.

## Architecture

```
src/
├── index.ts                 # MCP server entry point
├── gateway-instance.ts      # Singleton ATP gateway
└── tools/
    ├── validation.ts        # Contract validation, policy eval, approval checks
    ├── governance.ts        # Execution, contract/tool registration, authority binding
    ├── evidence.ts          # Evidence retrieval, approval workflow
    └── status.ts            # Gateway metadata and health
```

### Key Design Decisions

1. **Singleton Gateway** — Single `ATPGateway` instance persists across tool calls, maintaining state
2. **In-Memory Stores** — Reference implementation uses in-memory stores; replace with DB in production
3. **Tool Organization** — Tools grouped by category (validation, governance, evidence, status) for maintainability
4. **Zod Schemas** — Input validation via Zod, serialized to JSON Schema for MCP
5. **Error Handling** — Tools catch errors and return structured error responses (no exceptions)

## Adding a New Tool

1. Create input schema with Zod:
```typescript
export const MyToolInput = z.object({
  param1: z.string().describe("..."),
  param2: z.number().optional().describe("..."),
});

export type MyToolInput = z.infer<typeof MyToolInput>;
```

2. Implement the tool function:
```typescript
export async function myToolTool(input: MyToolInput): Promise<object> {
  const gateway = getGateway();
  // ... implement logic
  return { /* result */ };
}
```

3. Add to `index.ts`:
```typescript
import { MyToolInput, myToolTool } from "./tools/my-tool.js";

// In tools array:
{
  name: "atp_my_tool",
  description: "...",
  inputSchema: MyToolInput,
},

// In callTool function:
case "atp_my_tool":
  return await myToolTool(input as MyToolInput);
```

## Testing

Currently, the server is tested manually via MCP client (Claude Code, etc.) or via direct function calls.

### Manual Testing via MCP Client

1. Build: `npm run build`
2. Add to MCP client config
3. Restart client
4. Test tools in chat

### Testing Tool Functions Directly

Create a test script:

```typescript
// test.ts
import { getGateway } from "./src/gateway-instance.js";
import { registerContractTool } from "./src/tools/governance.js";
import { governExecuteTool } from "./src/tools/governance.js";

const contract = {
  version: "1.0.0",
  authority: "test.action",
  actions: ["test"],
  attestation: "light" as const,
};

// Test registration
const regResult = await registerContractTool({
  contract_id: "ctr_test",
  contract,
});
console.log("Register:", regResult);

// Test execution
const execResult = await governExecuteTool({
  contract_id: "ctr_test",
  action: "test",
  params: { foo: "bar" },
  wallet: "0xTest",
});
console.log("Execute:", execResult);
```

Run with: `npx ts-node test.ts`

## Extending with Real Tool Handlers

The `registerToolTool` currently registers echo handlers. To add real handlers:

```typescript
// In src/tools/governance.ts
gateway.registerTool(
  input.tool_name,
  input.contract_id,
  async (params, injectedHeaders) => {
    // Real tool logic here
    if (input.tool_name === "send-email") {
      return await sendEmailHandler(params, injectedHeaders);
    }
    // ... more tools
  }
);

async function sendEmailHandler(
  params: Record<string, unknown>,
  headers?: Record<string, string>
): Promise<{ status: number; body: unknown }> {
  const gmail = new gmail.gmail_v1.Gmail({
    auth: new OAuth2Client({
      access_token: headers?.Authorization?.replace("Bearer ", ""),
    }),
  });

  const result = await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw: encodeMessage(params),
    },
  });

  return {
    status: 200,
    body: { messageId: result.data.id },
  };
}
```

## Integrating Persistent Storage

Replace in-memory stores:

```typescript
// src/gateway-instance.ts
import { DatabaseContractStore } from "./store/db-contract-store.js";

export function getGateway(): ATPGateway {
  if (!gatewayInstance) {
    const gateway = new ATPGateway({...});
    
    // Replace stores
    gateway.contracts = new DatabaseContractStore(/* connection */);
    gateway.evidence = new DatabaseEvidenceStore(/* connection */);
    gateway.approvals = new DatabaseApprovalStore(/* connection */);
    // ... etc
    
    gatewayInstance = gateway;
  }
  return gatewayInstance;
}
```

## Enabling DUAL Integration

To enable DUAL network integration for wallet verification and evidence anchoring:

```typescript
// In gateway-instance.ts
const gatewayInstance = new ATPGateway({
  gateway_id: "mcp_atp_gateway",
  conformance_level: "verified",
  dual_integration: true,  // Enable DUAL
  dual: {
    enabled: true,
    endpoint: process.env.DUAL_ENDPOINT || "http://localhost:3000",
    network: (process.env.DUAL_NETWORK as "mainnet" | "testnet") || "testnet",
    api_key: process.env.DUAL_API_KEY || "",
    anchor_evidence: true,
    verify_wallets: true,
    cache_ttl: 300,
  },
});
```

## Environment Variables

```bash
# Optional: DUAL network configuration
DUAL_ENDPOINT=http://dual-gateway.example.com
DUAL_NETWORK=mainnet
DUAL_API_KEY=your-api-key-here

# Optional: Logging
DEBUG=atp:*
```

## Type Safety

The project uses strict TypeScript:
- `strict: true`
- `noUnusedLocals: true`
- `noUnusedParameters: true`
- `noImplicitReturns: true`

All tool functions must:
- Return `Promise<object>`
- Handle all error cases (no unhandled rejections)
- Return structured error objects (never throw)

## Performance Considerations

1. **Gateway as Singleton** — Avoids recreating stores on each call
2. **In-Memory Stores** — O(1) lookups, O(n) scans; replace with DB for scale
3. **Async Tool Handlers** — Support long-running operations (email, API calls)
4. **Timeout Handling** — Contracts can specify execution_timeout

## Security Considerations

1. **Credential Storage** — Current implementation stores plaintext in memory
   - In production: encrypt with KMS or use a vault
   - Never return credential values in responses
   - Log credential usage in evidence

2. **Authority Verification** — Currently trusts wallet bindings
   - In production: verify via DUAL or other identity system
   - Sign authority bindings with organizational keys

3. **Audit Logging** — Evidence is captured automatically
   - In production: forward to SIEM/compliance system
   - Sign evidence with gateway key

4. **Input Validation** — Zod schemas prevent malformed inputs
   - Tool handlers should validate params further
   - Never construct queries/commands from params without escaping

## Debugging

### Enable Debug Logging

```bash
DEBUG=atp:* npm start
```

### Log Gateway State

```typescript
import { getGateway } from "./src/gateway-instance.js";

const gw = getGateway();
console.log("Contracts:", gw.contracts.list());
console.log("Bindings:", gw.authority);  // AuthorityStore isn't directly dumpable
console.log("Evidence:", gw.evidence.list());
console.log("Pending Approvals:", gw.approvals.listPending());
```

### Common Issues

1. **"Unknown tool" error** — Tool name typo or case mismatch in callTool switch
2. **"Contract not found"** — Must call registerContractTool first
3. **"Authorization failed"** — Must call bindAuthorityTool with matching authorities
4. **Zod validation error** — Check input matches schema (especially types)

## Building for Distribution

```bash
# Build
npm run build

# Create npm package
npm pack

# Or publish to npm
npm publish
```

The `package.json` bin field installs `atp-mcp-server` globally, which clients can reference.

## Contributing

1. Follow the tool organization pattern (validation, governance, evidence, status)
2. Use Zod for all input schemas
3. Document each tool with description comments
4. Return structured objects (never throw errors)
5. Run `npm run build` to verify TypeScript
6. Test with actual MCP client before submitting

## License

Apache 2.0 — See LICENSE in root project.
