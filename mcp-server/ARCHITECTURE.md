# ATP MCP Server Architecture

## Overview

The ATP MCP Server exposes ATP governance as Model Context Protocol (MCP) tools. It bridges the MCP client (Claude Code, Cursor) with the ATP gateway, enabling AI agents to execute governed actions.

```
┌─────────────────────────────────┐
│     MCP Client                  │
│  (Claude Code, Cursor, etc.)    │
└────────────┬────────────────────┘
             │
          stdio
             │
┌────────────▼────────────────────┐
│    ATP MCP Server               │
│  ┌──────────────────────────┐   │
│  │   Tool Registry & Router │   │
│  └────────┬─────────────────┘   │
│           │                     │
│  ┌────────▼─────────────────┐   │
│  │  Tool Implementations    │   │
│  │  - Validation            │   │
│  │  - Governance            │   │
│  │  - Evidence              │   │
│  │  - Status                │   │
│  └────────┬─────────────────┘   │
│           │                     │
│  ┌────────▼──────────────────┐  │
│  │   Singleton Gateway       │  │
│  │   ┌────────────────────┐  │  │
│  │   │ ContractStore      │  │  │
│  │   │ AuthorityStore     │  │  │
│  │   │ CredentialStore    │  │  │
│  │   │ EvidenceStore      │  │  │
│  │   │ ApprovalStore      │  │  │
│  │   │ IdempotencyStore   │  │  │
│  │   └────────────────────┘  │  │
│  └────────────────────────────┘  │
└─────────────────────────────────┘
         ATP SDK
      (Validation,
       Policy Eval,
       Approval)
```

## Component Breakdown

### 1. MCP Server (`src/index.ts`)

**Responsibility:** Bridge between MCP protocol and ATP tools

**Key Functions:**
- Initialize MCP server with stdio transport
- Register all tools with descriptions and schemas
- Route incoming tool calls to handlers
- Serialize results to JSON for MCP client

**Technology:**
- `@modelcontextprotocol/sdk` for MCP protocol
- Zod for input validation and schema generation

### 2. Gateway Instance (`src/gateway-instance.ts`)

**Responsibility:** Maintain singleton ATP gateway

**Key Functions:**
- Lazy-initialize gateway on first tool call
- Ensure state persists across tool calls
- Provide reset capability for testing

**Design Pattern:**
```typescript
let instance: ATPGateway | null = null;

export function getGateway(): ATPGateway {
  if (!instance) instance = new ATPGateway(...);
  return instance;
}
```

### 3. Tool Implementations

#### 3a. Validation Tools (`src/tools/validation.ts`)

**Tools:**
- `atp_validate_contract` — Check contract spec compliance
- `atp_evaluate_policy` — Test parameters against constraints
- `atp_check_approval` — Determine if approval needed

**Characteristics:**
- No state changes
- Local computation (no gateway calls)
- Pure functions
- Support offline validation

#### 3b. Governance Tools (`src/tools/governance.ts`)

**Tools:**
- `atp_govern_execute` — Run full governance pipeline
- `atp_register_contract` — Load contract definition
- `atp_bind_authority` — Establish agent permissions
- `atp_store_credential` — Register API keys/tokens
- `atp_register_tool` — Map action to contract

**Characteristics:**
- Modify gateway state
- Orchestrate ATP pipeline
- Support approval workflows
- Enable credential injection

**Pipeline Sequence:**
```
Contract loaded
    ↓
Authority check (wallet bound with required authority?)
    ↓
Policy evaluation (params satisfy constraints?)
    ↓
Approval gate (approval needed? blocked here if so)
    ↓
Credential resolution (fetch and inject secret)
    ↓
Tool handler execution (call registered handler)
    ↓
Evidence capture (record execution details)
    ↓
Return result/approval_id
```

#### 3c. Evidence Tools (`src/tools/evidence.ts`)

**Tools:**
- `atp_get_evidence` — Retrieve audit trail by ID
- `atp_list_pending_approvals` — Show pending requests
- `atp_approve` — Review and approve pending request

**Characteristics:**
- Query gateway state
- Support approval workflow
- Enable compliance/audit
- Bridge from approval to execution

#### 3d. Status Tools (`src/tools/status.ts`)

**Tools:**
- `atp_gateway_status` — Get metadata and health

**Characteristics:**
- Read-only
- No parameter input
- Useful for diagnostics

### 4. ATP SDK Integration

The server leverages the ATP SDK for core logic:

**From SDK (`@atp-protocol/sdk`):**
- `validateContract()` — contract validation
- `evaluatePolicy()` — policy constraint checking
- `requiresApproval()` — approval threshold logic
- `parseEscalationPath()` — approval chain parsing

**From Gateway (`@atp-protocol/gateway`):**
- `ATPGateway` class — orchestration engine
- Store classes — contract/authority/credential/evidence management
- Middleware — authority checking, policy evaluation, credential resolution

### 5. Data Flow for Governed Execution

```
Client Request
    ↓
atp_govern_execute()
    ↓
gateway.execute(ExecutionRequest)
    ↓
    ├─ Resolve contract
    ├─ Check idempotency (if enabled)
    ├─ checkAuthority()
    ├─ evaluatePolicy()
    ├─ Approval gate (create if needed, return if pending)
    ├─ resolveCredentials()
    ├─ Call tool.handler(params, headers)
    ├─ captureEvidence()
    └─ Return ExecutionResponse
    ↓
Tool Result
```

### 6. Approval Workflow

```
atp_govern_execute() blocked at approval gate
    ↓
Returns { outcome: "outcome:denied", denied_stage: "approval", approval_id: "apr_..." }
    ↓
Client retrieves pending: atp_list_pending_approvals()
    ↓
Approver reviews and calls: atp_approve({ approval_id, approver_wallet })
    ↓
gateway.executeApproved() skips approval gate and executes
    ↓
Returns final { outcome: "outcome:success", result: {...} }
```

## State Management

### Gateway Stores (In-Memory, Reference Implementation)

| Store | Maps | Operations | Notes |
|-------|------|-----------|-------|
| ContractStore | contract_id → ATPContract | register, get, revoke, list | ~1KB per contract |
| AuthorityStore | wallet → WalletBinding | bind, getBinding, hasAuthority | ~100B per binding |
| CredentialStore | key → StoredCredential | store, resolve | ~1KB per credential |
| EvidenceStore | evidence_id → EvidenceRecord | store, get, getByExecution, list | ~5KB per record |
| IdempotencyStore | idempotency_key → ExecutionResponse | check, record | ~1KB per response |
| ApprovalStore | approval_id → PendingApproval | create, get, approve, deny, listPending | ~2KB per approval |

**Production Considerations:**
- Replace with persistent DB (PostgreSQL, DynamoDB, Firestore)
- Add indices on frequently queried fields
- Implement TTL for evidence/approvals
- Cache hot contracts and credentials

## Error Handling Strategy

**Tools never throw exceptions.** All errors are caught and returned as structured objects:

```typescript
try {
  // ... operation
  return { success: true, data: {...} };
} catch (error) {
  return {
    success: false,
    error: error instanceof Error ? error.message : "Unknown error",
  };
}
```

**Benefits:**
- MCP client receives well-formed JSON
- Clearer error messages
- Consistent response structure

## Security Considerations

### Authentication & Authorization
- **Authority Bindings** — Establish wallet → org → role → authorities mapping
- **Wallet Verification** — DUAL integration option for on-chain verification
- **Scope Validation** — Credentials must have required scopes

### Secrets Management
- **Current (Reference):** Plaintext in-memory storage
- **Production:** Integrate with vault (HashiCorp, AWS Secrets Manager, Google Secret Manager)
- **Injection:** Credentials injected as headers, never logged or cached

### Audit Trail
- **Evidence Records** — Capture every execution (success or denial)
- **Integrity Hashes** — Request and response hashing
- **Timestamps** — Fine-grained execution timeline
- **Production:** Forward to SIEM, sign with gateway key

### Input Validation
- **Zod Schemas** — Type-safe input parsing
- **Policy Constraints** — Enumeration, bounds, pattern, temporal validation
- **Escaping:** Tool handlers must escape params before use

## Extensibility Points

### 1. Add New Tools
Create new file in `src/tools/`, implement tool function, register in `index.ts`.

### 2. Add Real Tool Handlers
Replace echo handlers in `registerToolTool` with actual implementations:
```typescript
gateway.registerTool(
  "send-email",
  "ctr_send_email",
  async (params, headers) => {
    // Your real logic here
    return { status: 200, body: {...} };
  }
);
```

### 3. Integrate Persistent Storage
Extend store classes:
```typescript
class DatabaseContractStore extends ContractStore {
  async register(id, contract) {
    await db.insert("contracts", { id, contract });
    super.register(id, contract);
  }
}
```

### 4. Add DUAL Integration
Enable wallet verification and evidence anchoring:
```typescript
const gateway = new ATPGateway({
  dual_integration: true,
  dual: { endpoint, network, api_key, ... }
});
```

### 5. Custom Policy Constraints
Extend policy evaluation in SDK or implement custom rules.

## Performance Characteristics

### Time Complexity
| Operation | Complexity | Notes |
|-----------|-----------|-------|
| Contract lookup | O(1) | Direct map access |
| Authority check | O(m) | m = number of authorities per wallet |
| Policy evaluation | O(n) | n = number of constraints |
| Credential resolution | O(k) | k = number of stored credentials |
| Evidence lookup | O(1) | Direct map access |
| Evidence list | O(m) | m = total evidence records |

### Space Complexity
- **Per Contract:** ~1KB
- **Per Authority Binding:** ~100B
- **Per Credential:** ~1KB
- **Per Evidence Record:** ~5KB
- **Per Approval:** ~2KB

### Scaling
- **In-Memory Stores:** O(n) space, suitable for <10k contracts/evidence records
- **Persistent DB:** Unbounded storage, suitable for production

## Testing Strategy

### Unit Tests
Test individual tool functions with mock inputs.

### Integration Tests
- Register contract, bind authority, execute
- Full approval workflow
- Evidence capture and retrieval

### Load Tests
- Concurrent executions
- Large evidence stores
- High-volume approval workflows

### Security Tests
- Authority bypass attempts
- Policy constraint violations
- Credential leakage prevention

## Deployment

### Containerization
```dockerfile
FROM node:22-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY dist ./dist

ENTRYPOINT ["node", "dist/index.js"]
```

### Environment Variables
- `DEBUG=atp:*` — Enable debug logging
- `DUAL_ENDPOINT` — DUAL gateway URL
- `DUAL_NETWORK` — mainnet or testnet
- `DUAL_API_KEY` — DUAL API key

### Kubernetes
```yaml
apiVersion: v1
kind: Pod
metadata:
  name: atp-mcp-server
spec:
  containers:
  - name: server
    image: atp-mcp-server:latest
    env:
    - name: DUAL_ENDPOINT
      valueFrom:
        configMapKeyRef:
          name: atp-config
          key: dual_endpoint
```

## Troubleshooting

### Server not starting
- Check stdin/stdout are connected
- Verify SDK and Gateway packages are installed
- Check TypeScript compilation errors

### Tools not visible
- Restart MCP client
- Check configuration syntax
- Verify server started successfully

### Execution failures
- Check contract is registered
- Verify wallet is bound with authority
- Review policy constraints
- Check credential storage

## References

- [ATP Specification](../README.md)
- [MCP Protocol](https://spec.modelcontextprotocol.com/)
- [ATP SDK](../sdk/ts/src/)
- [ATP Gateway](../gateway/src/)
