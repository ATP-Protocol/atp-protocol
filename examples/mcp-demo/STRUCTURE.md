# ATP MCP Demo Structure

Complete end-to-end ATP governance demo for MCP tool execution.

## Directory Structure

```
mcp-demo/
├── src/
│   ├── demo.ts                          # Main orchestration (6 scenarios)
│   ├── server.ts                        # Gateway setup & configuration
│   ├── tools/
│   │   ├── email.ts                     # send-email handler
│   │   ├── inventory.ts                 # read-inventory handler
│   │   └── payment.ts                   # approve-payment handler
│   ├── contracts/
│   │   ├── send-email.json              # Full governance (approval required)
│   │   ├── read-inventory.json          # Lightweight (no approval)
│   │   └── approve-payment.json         # Threshold-based approval
│   └── output/
│       └── formatter.ts                 # Colored terminal output
├── package.json
├── tsconfig.json
├── README.md                            # Quick start & detailed docs
├── STRUCTURE.md                         # This file
└── .gitignore
```

## Files Overview

### Core Files

**`src/demo.ts`** (340 lines)
- Main entry point
- Defines 6 scenarios demonstrating the governance pipeline
- Executes each scenario with real policy/authority checks
- Prints beautiful colored output showing each step
- Summarizes results

**`src/server.ts`** (95 lines)
- Sets up the ATP Gateway
- Registers 3 contracts (send-email, read-inventory, approve-payment)
- Binds 3 wallets to org/role/authorities
- Stores 3 credential providers
- Registers tool handlers

### Tool Handlers

**`src/tools/email.ts`** (38 lines)
- Mock send-email implementation
- Logs what it would do
- In real: calls Gmail API with injected OAuth token

**`src/tools/inventory.ts`** (40 lines)
- Mock read-inventory implementation
- Returns fake warehouse data
- In real: queries inventory database with injected bearer token

**`src/tools/payment.ts`** (42 lines)
- Mock approve-payment implementation
- Logs payment details
- In real: calls banking API with injected API key

### Contracts

**`src/contracts/send-email.json`** (34 lines)
- Full governance
- Authority: `org.procurement.send-email`
- Approval: Required (always)
- Scope: Domain whitelist, max attachments, prohibited content
- Credentials: OAuth token (Gmail)
- Attestation: Full

**`src/contracts/read-inventory.json`** (24 lines)
- Lightweight governance
- Authority: `org.operations.read-inventory`
- Approval: Not required
- Scope: Read-only operations
- Credentials: Bearer token
- Attestation: Light

**`src/contracts/approve-payment.json`** (33 lines)
- Threshold-based approval
- Authority: `org.finance.approve-payment`
- Approval: Required only above $10k
- Scope: Currency whitelist, amount limits
- Credentials: API key (banking)
- Attestation: Full

### Output

**`src/output/formatter.ts`** (150 lines)
- Beautiful ANSI colored output
- Step indicators (✓, ✗, ⏳)
- Boxes, tables, headers
- Scenario formatting

### Configuration

**`package.json`**
- TypeScript, tsx, uuid
- Scripts: build, demo, dev, clean
- Workspace references to SDK and gateway

**`tsconfig.json`**
- ES2020 target
- ESNext modules
- Strict mode

## Scenarios

### 1. Send Email to Approved Vendor ✓
```
Authority: ✓ (Alice has org.procurement.send-email)
Policy: ✓ (vendor@approved-vendors.com is whitelisted)
Approval: ⏳ (required, in queue)
Credentials: ✓ (Gmail OAuth token resolved)
Execution: ✓ (email handler called)
Outcome: SUCCESS
```

### 2. Send Email to Unauthorized Domain ✗
```
Authority: ✓ (Alice has authority)
Policy: ✗ (random-company.com not in whitelist)
Approval: (not reached)
Credentials: (not reached)
Execution: (not reached)
Outcome: DENIED (policy violation)
```

### 3. Send Email with Prohibited Content ✗
```
Authority: ✓ (Alice has authority)
Policy: ✗ ("wire transfer" in prohibited_content)
Approval: (not reached)
Credentials: (not reached)
Execution: (not reached)
Outcome: DENIED (policy violation)
```

### 4. Read Inventory ✓
```
Authority: ✓ (Alice has org.operations.read-inventory)
Policy: ✓ (read-only operation)
Approval: ✓ (not required)
Credentials: ✓ (inventory bearer token resolved)
Execution: ✓ (inventory handler called)
Outcome: SUCCESS
```

### 5. Approve $5,000 Payment ✓
```
Authority: ✓ (Charlie has org.finance.approve-payment)
Policy: ✓ (USD allowed, $5k < $50k max)
Approval: ✓ (not required, $5k < $10k threshold)
Credentials: ✓ (banking API key resolved)
Execution: ✓ (payment handler called)
Outcome: SUCCESS
```

### 6. Approve $25,000 Payment ⏳
```
Authority: ✓ (Charlie has org.finance.approve-payment)
Policy: ✓ (USD allowed, $25k < $50k max)
Approval: ⏳ (required, $25k > $10k threshold)
Credentials: ✓ (banking API key resolved)
Execution: (not reached until approval)
Outcome: PENDING (awaiting approver decision)
```

## Governance Pipeline

For each scenario, the demo walks through:

1. **Authority Check** — wallet → org/role → authority
2. **Policy Evaluation** — scope constraints against params
3. **Approval Gate** — required? threshold exceeded?
4. **Credential Resolution** — provider → token/key
5. **Tool Execution** — handler with injected credentials
6. **Evidence Recording** — full audit trail

## Key Design Points

### Real Governance, Mock Tools
- Contracts are real (loaded from JSON, validated)
- Authority bindings are real (checked via store)
- Policy evaluation is real (scope constraints applied)
- Credentials are real (stored and resolved)
- **Tools are mocks** (log instead of actually sending/charging)

### Three Governance Profiles
1. **Full** — approval required, full attestation
2. **Lightweight** — no approval, light attestation
3. **Threshold-based** — approval only above amount

### Non-Repudiation
Every execution captured with:
- Who (wallet, org, role)
- What (action, contract, params)
- When (timestamp chain)
- How (authority decision, policy constraints, approval, credentials)
- Outcome (success/denied, result/reason)

## Running the Demo

```bash
cd examples/mcp-demo
npm install
npm run demo
```

Output: Beautiful colored terminal showing 6 scenarios executing through the governance pipeline.

## Extending the Demo

### Add a Tool
1. Create `src/tools/new-tool.ts`
2. Create `src/contracts/new-tool.json`
3. Call in `setupDemoGateway()`
4. Add to `scenarios` array

### Add a Scenario
1. Edit `scenarios` array in `demo.ts`
2. Run `npm run demo`

### Swap Real Tools
1. Replace handler function with real API call
2. Use injected credentials from `injectedHeaders` param
3. Governance pipeline unchanged

## What This Shows

**For Product:** ATP makes it safe to delegate authority to AI agents with:
- Bounded authorities (org/role/action)
- Policy constraints (whitelists, deny lists, amounts)
- Approval gates (manual review for high-risk)
- Credential injection (agents never see secrets)
- Full evidence (audit trail for compliance)

**For Developers:** Building governed tools is:
- Declarative (contracts specify governance)
- Type-safe (TypeScript contracts & types)
- Pluggable (gateway orchestrates everything)
- Mockable (tool handlers are simple)
- Auditable (evidence captured automatically)

**For Teams:** This pattern enables:
- Safe delegation to AI agents
- Compliance & regulatory evidence
- Clear escalation paths (approvals)
- Easy policy changes (edit contracts, no code)
- Cross-org federation (DUAL anchoring)
