# ATP MCP Server

**Agent Trust Protocol (ATP) governance as an MCP server** — enable any MCP client (Claude Code, Cursor, etc.) to execute governed AI agent actions.

This is a standalone MCP server that exposes the full ATP governance pipeline as tools. No additional setup required beyond installing the package and configuring your MCP client.

## What is ATP?

ATP (Agent Trust Protocol) is a governance framework for controlled AI agent execution. It provides:

- **Authority** — verify agents are bound to organizations with required permissions
- **Policy** — enforce constraints on request parameters (amount, recipient, etc.)
- **Approval** — require human review for sensitive actions
- **Credentials** — inject secrets (API keys, OAuth tokens) at execution time
- **Evidence** — capture complete audit trails for compliance

See the [ATP specification](../README.md) for details.

## Installation

### Global Installation (Recommended)

```bash
npm install -g @atp-protocol/mcp-server
```

Then add to your MCP client config (see below).

### From Source

```bash
cd mcp-server
npm install
npm run build
node dist/index.js
```

## Configuration

### Claude Code / Cursor

Add to `~/.claude_code/mcp_servers.json` (or your client's config):

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

Or if globally installed:

```json
{
  "mcpServers": {
    "atp": {
      "command": "atp-mcp-server"
    }
  }
}
```

### Claude Desktop

Add to `~/Library/Application\ Support/Claude/claude_desktop_config.json` (macOS):

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

Restart Claude Desktop, then you should see ATP tools available.

## Tools Overview

### Validation Tools

#### `atp_validate_contract`
Validate an ATP contract for spec compliance.
- Input: `{ contract: object }`
- Output: validation errors and warnings
- Use when: loading a new contract, auditing configs, debugging policy issues

#### `atp_evaluate_policy`
Check if request parameters satisfy a contract's policy constraints.
- Input: `{ contract: object, params: object }`
- Output: permitted/denied with reason
- Use when: checking if a request will pass policy before execution
- Note: LOCAL validation (no gateway call)

#### `atp_check_approval`
Check if a contract requires approval for given parameters.
- Input: `{ contract: object, amount?: number }`
- Output: approval required, approver role, escalation path
- Use when: understanding approval requirements before execution

### Governance Tools

#### `atp_govern_execute`
Execute an action through the full ATP pipeline.
- Input: `{ contract_id, action, params, wallet, idempotency_key? }`
- Output: execution result with outcome, evidence_id, or denial reason
- Pipeline: Authority → Policy → Approval → Credentials → Execute → Evidence
- Use when: executing any action that needs governance
- If denied_stage is "approval", use `atp_approve` to continue

#### `atp_register_contract`
Register a contract with the gateway.
- Input: `{ contract_id, contract }`
- Output: confirmation
- Use when: loading a new contract definition

#### `atp_bind_authority`
Bind a wallet to an organization with authorities.
- Input: `{ wallet, org_id, role, authorities, constraints? }`
- Output: confirmation
- Use when: onboarding agents, changing roles, granting authorities

#### `atp_store_credential`
Store a credential (API key, OAuth token, etc.) in the gateway.
- Input: `{ key, provider, credential_type, value, scope, org_id, expires_at? }`
- Output: confirmation
- Warning: Reference implementation stores plaintext; use a vault in production
- Use when: configuring tool credentials for an org

#### `atp_register_tool`
Register a tool handler with ATP governance.
- Input: `{ tool_name, contract_id }`
- Output: confirmation
- Use when: onboarding new MCP tools into the governance system

### Evidence & Approval Tools

#### `atp_get_evidence`
Retrieve a complete evidence record by ID.
- Input: `{ evidence_id }`
- Output: execution audit trail (scope, policy constraints, approval, credentials, outcome, hashes)
- Use when: auditing executions, verifying compliance, investigating failures

#### `atp_list_pending_approvals`
List all pending approval requests.
- Input: `{}`
- Output: array of pending approvals with approval_id, contract_id, action, params
- Use when: checking for pending approvals, building approver dashboards

#### `atp_approve`
Approve a pending request and proceed with execution.
- Input: `{ approval_id, approver_wallet, approver_role? }`
- Output: updated approval status + final execution result
- Use when: approver reviews and agrees to the request

### Status Tools

#### `atp_gateway_status`
Get gateway metadata and health status.
- Input: `{}`
- Output: gateway info, contract count, approval stats, evidence stats
- Use when: verifying gateway is running, checking capabilities

## Example Workflows

### 1. Simple Governed Execution

```
Register contract → Bind agent wallet → Execute action
```

```
1. atp_register_contract({contract_id: "ctr_email", contract: {...}})
2. atp_bind_authority({wallet: "0xAgent", org_id: "org_001", role: "user", authorities: ["org.email.*"]})
3. atp_govern_execute({contract_id: "ctr_email", action: "send-email", params: {to: "user@example.com"}, wallet: "0xAgent"})
```

### 2. Execution with Approval

```
Register contract → Bind agent → Execute → Receive approval_id → Wait for approver → Approve
```

```
1. atp_register_contract({...})
2. atp_bind_authority({...})
3. response = atp_govern_execute({...})  // Returns approval_id if approval required
4. atp_list_pending_approvals({})  // See pending request
5. atp_approve({approval_id: response.approval_id, approver_wallet: "0xApprover"})
```

### 3. Setup with Credentials

```
Register contract → Store credential → Bind authority → Bind tool → Execute
```

```
1. atp_register_contract({contract_id: "ctr_github", contract: {...approval, credentials: {provider: "github-api", ...}}})
2. atp_store_credential({key: "github_1", provider: "github-api", credential_type: "oauth_token", value: "ghp_xxx", scope: ["repo"], org_id: "org_001"})
3. atp_bind_authority({wallet: "0xAgent", org_id: "org_001", role: "engineer", authorities: ["org.github.*"]})
4. atp_register_tool({tool_name: "create-pr", contract_id: "ctr_github"})
5. atp_govern_execute({contract_id: "ctr_github", action: "create-pr", params: {...}, wallet: "0xAgent"})
```

## Execution Outcomes

Every execution returns an outcome:

- `outcome:success` — action completed successfully
- `outcome:denied` — blocked at authority/policy/approval/credential stage
- `outcome:failure` — execution failed with error
- `outcome:timeout` — action exceeded timeout
- `outcome:partial` — action partially succeeded
- `outcome:unknown` — status unknown (e.g. 202 Accepted)

When outcome is `outcome:denied`, check `denied_stage` and `denied_reason` to understand why:

- `authority` — wallet not bound or lacks required authority
- `policy` — request parameters violated constraints
- `approval` — approval required; use approval_id with `atp_approve`
- `credential` — credential missing or invalid
- `execution` — tool handler failed

## Evidence Capture

Every execution (successful or denied) is recorded as evidence:

```javascript
const evidence = atp_get_evidence({ evidence_id: result.evidence_id });
// Returns:
// - scope_snapshot (the request params)
// - policy_snapshot (constraints evaluated)
// - approval details (if applicable)
// - credential_provider, credential_scope_used
// - request_hash, response_hash (for integrity verification)
// - timestamps (requested, authorized, approved, executed, evidenced)
// - attestation_level (full/light/none)
```

Evidence is automatically captured based on the contract's `attestation` level:
- `full` — complete details with cryptographic hashes
- `light` — summary info, minimal hashes
- `none` — no evidence capture (not recommended)

## Reference: Contract Structure

A minimal ATP contract:

```json
{
  "version": "1.0.0",
  "authority": "org.procurement.send-email",
  "actions": ["send-email"],
  "attestation": "full",
  "approval": {
    "required": true,
    "approver_role": "procurement_manager"
  },
  "credentials": {
    "provider": "gmail-api",
    "scope": ["send"],
    "inject_as": "oauth_token"
  }
}
```

See the [ATP specification](../README.md) for complete contract schema.

## Production Considerations

This reference implementation is suitable for testing and learning. For production use:

1. **Persist State** — Replace in-memory stores with a database
2. **Secure Credentials** — Integrate with a secrets vault (HashiCorp Vault, AWS Secrets Manager)
3. **DUAL Integration** — Enable DUAL network for wallet verification and evidence anchoring
4. **Audit Logging** — Forward evidence records to SIEM/compliance systems
5. **Rate Limiting** — Add rate limits per wallet/org/action
6. **Real Handlers** — Replace echo handlers with actual tool implementations

## Troubleshooting

### Tools not showing up in client

1. Ensure the server is running: `atp-mcp-server` (should print "ATP MCP server running on stdio")
2. Restart your MCP client
3. Check client logs for connection errors
4. Verify JSON in config file (use a JSON validator)

### "Contract not found" error

Contract must be registered before execution. Call `atp_register_contract` first.

### "Authorization failed" error

Wallet must be bound to an organization with the required authority. Call `atp_bind_authority` first.

### Approval stuck in pending

Approvals are in-memory only (reference implementation). Close and restart the server to clear. In production, use persistent storage.

### Credential not injected

1. Verify credential key matches provider in contract: `atp_store_credential` then check `contract.credentials.provider`
2. Check credential scope covers required scope: `contract.credentials.scope`
3. Ensure credential org_id matches the wallet's org_id

## License

Apache 2.0 — See LICENSE for details.
