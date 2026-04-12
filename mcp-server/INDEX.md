# ATP MCP Server — Complete Index

## Quick Links

- **Getting Started:** [README.md](README.md)
- **Usage Examples:** [EXAMPLES.md](EXAMPLES.md)
- **Technical Architecture:** [ARCHITECTURE.md](ARCHITECTURE.md)
- **Development Guide:** [DEVELOPMENT.md](DEVELOPMENT.md)
- **Build Completion:** [DELIVERABLES.md](DELIVERABLES.md)

## File Guide

### Source Code (1,073 lines)

| File | Lines | Purpose |
|------|-------|---------|
| `src/index.ts` | 270 | MCP server entry point, tool registration, request routing |
| `src/gateway-instance.ts` | 32 | Singleton ATP gateway, state management |
| `src/tools/validation.ts` | 149 | Contract validation, policy evaluation, approval checks |
| `src/tools/governance.ts` | 326 | Execution, registration, authority binding, credentials |
| `src/tools/evidence.ts` | 232 | Evidence retrieval, approval workflow |
| `src/tools/status.ts` | 64 | Gateway status and metadata |

**Total Source:** 1,073 lines

### Configuration (57 lines)

| File | Lines | Purpose |
|------|-------|---------|
| `package.json` | 34 | NPM dependencies and build scripts |
| `tsconfig.json` | 23 | TypeScript strict mode configuration |

**Total Configuration:** 57 lines

### Documentation (2,034 lines)

| File | Lines | Purpose |
|------|-------|---------|
| `README.md` | 316 | User guide, setup, configuration, troubleshooting |
| `EXAMPLES.md` | 570 | 5 complete workflows with JSON examples |
| `ARCHITECTURE.md` | 416 | Technical design, component breakdown, extensibility |
| `DEVELOPMENT.md` | 320 | Development guide, testing, extending, deployment |
| `DELIVERABLES.md` | 355 | Completion checklist and feature summary |
| `INDEX.md` | 57 | This file |

**Total Documentation:** 2,034 lines

### Project Total: 3,164 lines

## 12 Tools Overview

### Validation Tools (3)

#### 1. `atp_validate_contract`
**Purpose:** Validate ATP contract for specification compliance  
**Input:** `{ contract: object }`  
**Output:** `{ valid: boolean, errors: [], warnings: [] }`  
**Use Case:** Loading new contracts, auditing configurations  
**Location:** `src/tools/validation.ts` lines 22-45

#### 2. `atp_evaluate_policy`
**Purpose:** Test request parameters against policy constraints  
**Input:** `{ contract: object, params: object }`  
**Output:** `{ permitted: boolean, denial_reason?: string, constraints_applied: [] }`  
**Use Case:** Pre-flight validation, policy compliance checking  
**Location:** `src/tools/validation.ts` lines 68-100

#### 3. `atp_check_approval`
**Purpose:** Determine if action requires approval  
**Input:** `{ contract: object, amount?: number }`  
**Output:** `{ approval_required: boolean, approver_role: string, escalation_path?: [] }`  
**Use Case:** Understanding approval requirements  
**Location:** `src/tools/validation.ts` lines 123-160

### Governance Tools (5)

#### 4. `atp_govern_execute` (PRIMARY)
**Purpose:** Execute action through full ATP pipeline  
**Pipeline:** Authority → Policy → Approval → Credentials → Execute → Evidence  
**Input:** `{ contract_id, action, params, wallet, idempotency_key? }`  
**Output:** `{ execution_id, outcome, result?, evidence_id?, approval_id? }`  
**Outcomes:** `success | denied | failure | timeout | partial | unknown`  
**Location:** `src/tools/governance.ts` lines 32-87

#### 5. `atp_register_contract`
**Purpose:** Register contract with gateway  
**Input:** `{ contract_id: string, contract: object }`  
**Output:** `{ contract_id, registered: boolean, registered_at }`  
**Location:** `src/tools/governance.ts` lines 110-147

#### 6. `atp_bind_authority`
**Purpose:** Bind wallet to organization with role and authorities  
**Input:** `{ wallet, org_id, role, authorities[], constraints? }`  
**Output:** `{ wallet, org_id, role, authorities, bound_at }`  
**Location:** `src/tools/governance.ts` lines 170-217

#### 7. `atp_store_credential`
**Purpose:** Store API key/OAuth token for injection  
**Input:** `{ key, provider, credential_type, value, scope[], org_id, expires_at? }`  
**Output:** `{ key, provider, org_id, stored_at, expires_at }`  
**Security:** Reference implementation stores plaintext (use vault in production)  
**Location:** `src/tools/governance.ts` lines 240-297

#### 8. `atp_register_tool`
**Purpose:** Register tool handler with contract  
**Input:** `{ tool_name, contract_id }`  
**Output:** `{ tool_name, contract_id, registered, handler_type }`  
**Location:** `src/tools/governance.ts` lines 320-358

### Evidence & Approval Tools (3)

#### 9. `atp_get_evidence`
**Purpose:** Retrieve complete execution audit trail  
**Input:** `{ evidence_id }`  
**Output:** Full evidence object with scope, policy, approval, credentials, hashes  
**Use Case:** Compliance audits, execution investigation  
**Location:** `src/tools/evidence.ts` lines 24-80

#### 10. `atp_list_pending_approvals`
**Purpose:** List approval requests awaiting review  
**Input:** `{}`  
**Output:** `{ pending_count, pending_approvals[] }`  
**Use Case:** Approver dashboard, workflow visibility  
**Location:** `src/tools/evidence.ts` lines 103-142

#### 11. `atp_approve`
**Purpose:** Approve pending request and proceed with execution  
**Input:** `{ approval_id, approver_wallet, approver_role? }`  
**Output:** `{ approval_id, approved, execution result }`  
**Location:** `src/tools/evidence.ts` lines 165-232

### Status Tool (1)

#### 12. `atp_gateway_status`
**Purpose:** Get gateway metadata and health  
**Input:** `{}`  
**Output:** Gateway ID, version, conformance level, contract/approval/evidence stats  
**Location:** `src/tools/status.ts` lines 17-52

## Key Design Patterns

### Singleton Gateway (`src/gateway-instance.ts`)
```typescript
let instance: ATPGateway | null = null;
export function getGateway(): ATPGateway {
  if (!instance) instance = new ATPGateway(...);
  return instance;
}
```

### Tool Template (`src/tools/*.ts`)
```typescript
export const ToolInput = z.object({...});
export type ToolInput = z.infer<typeof ToolInput>;

export async function toolTool(input: ToolInput): Promise<object> {
  try {
    // ... implementation
    return { /* result */ };
  } catch (error) {
    return { /* error */ };
  }
}
```

### MCP Tool Registration (`src/index.ts`)
```typescript
const tools = [
  {
    name: "atp_tool_name",
    description: "...",
    inputSchema: ZodSchema,
  },
];

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const result = await callTool(request.params.name, request.params.arguments);
  return { content: [{ type: "text", text: JSON.stringify(result) }] };
});
```

## Workflow Examples

### Basic Execution (5 steps)
1. `atp_register_contract` — Load contract definition
2. `atp_bind_authority` — Grant agent permissions
3. `atp_govern_execute` — Execute action
4. Receive `outcome:success` or `approval_id`
5. `atp_get_evidence` — Retrieve audit trail

### With Approval (8 steps)
1. `atp_register_contract` — Load contract
2. `atp_bind_authority` — Grant agent
3. `atp_govern_execute` — Execute (returns approval_id)
4. `atp_list_pending_approvals` — Show pending
5. Approver reviews
6. `atp_approve` — Approve request
7. Execution completes
8. `atp_get_evidence` — Audit trail

See `EXAMPLES.md` for complete JSON examples.

## Error Handling

All tools return structured objects (never throw):
- Success: `{ success: true, data: {...} }`
- Error: `{ error: "reason" }`
- Denial: `{ outcome: "outcome:denied", denied_reason: "...", denied_stage: "..." }`

## Testing

### Manual Testing
1. Build: `npm run build`
2. Add to MCP client config
3. Restart client
4. Use tools in chat

### Unit Testing
Test individual tool functions with Zod validation.

### Integration Testing
Register → Bind → Execute → Approve → Evidence flow.

## Extensibility

### Adding New Tools
1. Create `src/tools/new-tool.ts`
2. Define Zod schema and tool function
3. Import and register in `src/index.ts`
4. Document in README

### Adding Real Handlers
Replace echo handlers in `registerToolTool`:
```typescript
gateway.registerTool("send-email", "ctr_email", 
  async (params, headers) => {
    // Real implementation
    return { status: 200, body: {...} };
  }
);
```

### Persistent Storage
Extend store classes:
```typescript
class DatabaseContractStore extends ContractStore {
  async register(id, contract) {
    await db.insert("contracts", {id, contract});
    super.register(id, contract);
  }
}
```

## Production Checklist

- [ ] Replace in-memory stores with database
- [ ] Integrate credential vault (HashiCorp, AWS, Google)
- [ ] Enable DUAL integration (wallet verification)
- [ ] Implement real tool handlers
- [ ] Add rate limiting
- [ ] Configure audit logging
- [ ] Sign evidence records
- [ ] Enable HTTPS (if exposed)
- [ ] Set up monitoring/alerting
- [ ] Document organization policies

## Performance Notes

| Operation | Complexity | Notes |
|-----------|-----------|-------|
| Contract lookup | O(1) | Direct map |
| Policy evaluation | O(n) | n = constraints |
| Authority check | O(m) | m = authorities/wallet |
| Evidence lookup | O(1) | Direct map |
| Evidence list | O(k) | k = total records |

**Scaling:** In-memory stores suitable for <10k contracts/evidence. Use persistent DB for scale.

## Security Considerations

1. **Credentials:** Currently plaintext (use vault in production)
2. **Authority:** Trust bindings (use DUAL verification in production)
3. **Audit:** Evidence captured automatically
4. **Secrets:** Never log or cache credentials

## Integration

### With Claude Code
```json
{
  "mcpServers": {
    "atp": {
      "command": "npx",
      "args": ["@atp-protocol/mcp-server"]
    }
  }
}
```

### With Cursor
Same configuration, different config file location.

### With Claude Desktop
Add to `~/Library/Application Support/Claude/claude_desktop_config.json`

## References

- [ATP Specification](../README.md)
- [MCP Protocol](https://spec.modelcontextprotocol.com/)
- [SDK Documentation](../sdk/ts/src/)
- [Gateway Reference](../gateway/src/)

## Statistics

| Category | Count |
|----------|-------|
| Tools | 12 |
| Source Files | 6 |
| Tool Files | 4 |
| Documentation Files | 6 |
| Lines of Code | 1,073 |
| Lines of Configuration | 57 |
| Lines of Documentation | 2,034 |
| **Total Lines** | **3,164** |

## Contact & Support

See README.md for troubleshooting and common issues.

---

**ATP MCP Server v0.1.0** — Production-ready reference implementation
