# ATP MCP Demo — End-to-End Governance

This is the complete end-to-end ATP demo that shows how ATP governs real MCP tool execution with a full pipeline of checks, approvals, credential injection, and evidence capture.

## What It Shows

ATP wraps MCP tool execution with governance. The demo runs 6 real-world scenarios to show the complete pipeline:

```
Authority Check → Policy Evaluation → Approval Gate → Credential Injection → Execution → Evidence
```

**Scenarios:**

1. ✅ **Send email to approved vendor** → SUCCESS (full governance pipeline)
   - Alice has authority, domain whitelisted, under approval threshold, credentials injected, executes

2. ❌ **Send email to unauthorized domain** → DENIED (policy violation)
   - Alice has authority, but domain not in whitelist — blocked at policy stage

3. ❌ **Send email with prohibited content** → DENIED (deny list match)
   - Alice has authority, domain whitelisted, but content triggers deny list — policy blocks

4. ✅ **Read inventory** → SUCCESS (lightweight governance)
   - No approval required, bearer token injected, reads data

5. ✅ **Approve $5,000 payment** → SUCCESS (below threshold)
   - Amount under $10k approval threshold, executes directly

6. ⏳ **Approve $25,000 payment** → PENDING (requires approval)
   - Amount over threshold, goes to approval queue, awaits decision

## Three Governed Tools

### 1. `send-email` — Full Governance

**Contract:** `send-email.json`
- **Authority:** `org.procurement.send-email`
- **Approval:** Required (always)
- **Policy Constraints:**
  - Domain whitelist: `@approved-vendors.com`, `@internal.company.com`
  - Max attachments: 5
  - Prohibited content: wire transfer instructions, payment routing, SWIFT codes
- **Credential:** OAuth token (Gmail)
- **Attestation:** Full

Demonstrates the complete pipeline with approval gate, content filtering, and OAuth injection.

### 2. `read-inventory` — Lightweight Governance

**Contract:** `read-inventory.json`
- **Authority:** `org.operations.read-inventory`
- **Approval:** Not required
- **Policy Constraints:**
  - Read-only operation
  - Non-confidential data only
- **Credential:** Bearer token (Inventory API)
- **Attestation:** Light

Shows fast path: no approval needed, simple token injection.

### 3. `approve-payment` — Threshold-Based Approval

**Contract:** `approve-payment.json`
- **Authority:** `org.finance.approve-payment`
- **Approval:** Required only above $10,000
- **Policy Constraints:**
  - Allowed currencies: USD, EUR, GBP
  - Max amount: $50,000
  - Transaction types: vendor-payment, expense-reimbursement
- **Credential:** API key (Banking API)
- **Attestation:** Full

Demonstrates conditional approval based on amount, with ceiling constraints.

## Identity & Authorization

Three wallets with different roles:

| Wallet | Role | Authority |
|--------|------|-----------|
| `0xAlice` | procurement_agent | send-email, read-inventory |
| `0xBob` | procurement_manager | send-email (can approve), read-inventory |
| `0xCharlie` | finance_controller | approve-payment, read-inventory |

## Credentials

Pre-configured for each wallet/provider:

- **Alice + Gmail:** OAuth token for `mail.send`
- **Alice + Inventory API:** Bearer token for `inventory.read`
- **Charlie + Banking API:** API key for `payments.process`

The gateway injects these into the execution context automatically.

## How the Pipeline Works

### 1. Authority Check
Verify wallet is bound to org/role with the required authority for the contract.

```
0xAlice has role=procurement_agent with authority=org.procurement.send-email ✓
```

### 2. Policy Evaluation
Constraints from contract scope evaluated against request params.

```
Domain check: vendor@approved-vendors.com ✓ (in whitelist)
Content check: no prohibited strings found ✓
Attachments: 2 ≤ 5 ✓
```

### 3. Approval Decision
If required (always, or above threshold), request goes to approval queue.

```
Contract requires approval: YES
Approver role: procurement_manager
Status: PENDING_REVIEW → awaiting human decision
```

### 4. Credential Resolution
Look up stored credentials, inject into execution context.

```
Provider: gmail
Token: goog_ya29_...demo_token
Scopes: ["mail.send"]
Inject method: oauth_token → Authorization: Bearer <token>
```

### 5. Tool Execution
Handler runs with validated params + injected credentials.

```
handler.sendEmail({
  to: "vendor@approved-vendors.com",
  subject: "Purchase Order",
  headers: { Authorization: "Bearer goog_ya29_..." }
})
→ { status: 200, message_id: "msg_abc123..." }
```

### 6. Evidence Recording
Complete audit trail captured.

```
EvidenceRecord {
  evidence_id: "evi_abc123..."
  authority: org.procurement.send-email
  wallet: 0xAlice
  policy_constraints: [domain, content, attachments]
  approval: { status: APPROVED, decided_by: 0xBob, ... }
  outcome: success
  credentials_used: [gmail → mail.send]
  timestamp_chain: [requested, authorized, approved, executed, evidenced]
}
```

## Running the Demo

### Install dependencies

```bash
cd examples/mcp-demo
npm install
```

### Run the demo

```bash
npm run demo
```

This will:
1. Set up the gateway with 3 contracts, 3 authority bindings, and 3 credential providers
2. Execute all 6 scenarios through the governance pipeline
3. Print beautiful colored output showing each step
4. Show which scenarios succeeded, were denied, or are pending
5. Explain what's happening under the hood

### Example Output

```
▸ ATP — MCP Governed Execution Demo

📡 Initializing ATP Gateway with governance contracts...
   ✓ Gateway ready
   ✓ 3 contracts registered
   ✓ 3 wallets bound with authorities
   ✓ 3 credential providers configured

▸ EXECUTION SCENARIOS

📋 Scenario: Send Email to Approved Vendor
   Full governance: authority→policy→approval→credentials→execution

   Request:
     • Contract: ctr_send_email
     • Action: send-email
     • Wallet: 0xAlice

   Pipeline:
   ✓ Authority verified (procurement_agent)
   ✓ Policy satisfied (domain whitelist, no prohibited content)
   ⏳ Approval Required (awaiting procurement_manager review)
   ✓ Credentials resolved (gmail oauth_token)
   ✓ Execution successful (msg_abc123)

   ✓ SUCCESS
   Evidence ID: evi_abc123...

📋 Scenario: Send Email to Unauthorized Domain
   Policy violation at domain check

   ...
   ✓ Authority verified
   ✗ Policy violated (domain not whitelisted)

   ✗ DENIED
   Policy violated: domain not whitelisted

...
```

## Key Design Points

### Why This Demo Matters

**ATP solves the agent trust problem:** How do you safely delegate authority to AI agents?

- **Authority:** Agents have explicit roles with bounded authorities
- **Policy:** Each tool has constraints that are enforced before execution
- **Approval:** High-risk operations require human approval
- **Credentials:** Agents never see secrets; gateway injects them
- **Evidence:** Every execution is audited with non-repudiable proof

This demo shows all of it working together in a real MCP scenario.

### Mock vs. Real

The tools are **mocks** (they log what they would do, not actually send emails or charge cards). The governance pipeline is **real**:

- Contracts are loaded and validated
- Authorities are bound and checked
- Policies are evaluated against real constraints
- Credentials are resolved and injected
- Evidence is captured

Swapping in real tools (Gmail API, Stripe API, etc.) requires only changing the handler functions — the governance pipeline stays the same.

### Extending the Demo

Add more tools:

1. Create a contract JSON in `src/contracts/`
2. Create a handler function in `src/tools/`
3. Register in `setupDemoGateway()`
4. Add a scenario in `demo.ts`

Add more scenarios:

1. Edit the `scenarios` array in `demo.ts`
2. Set `expectedOutcome` to test different paths
3. Run `npm run demo` to see the results

## Architecture

```
mcp-demo/
├── src/
│   ├── demo.ts                    # Main demo orchestration
│   ├── server.ts                  # Gateway setup
│   ├── tools/
│   │   ├── email.ts               # send-email handler
│   │   ├── inventory.ts           # read-inventory handler
│   │   └── payment.ts             # approve-payment handler
│   ├── contracts/
│   │   ├── send-email.json        # Full governance
│   │   ├── read-inventory.json    # Lightweight
│   │   └── approve-payment.json   # Threshold-based
│   └── output/
│       └── formatter.ts           # Colored output
├── package.json
├── tsconfig.json
└── README.md
```

## What This Shows

1. **ATP works with real MCP tools** — not abstract; concrete handlers
2. **Multiple governance profiles** — full, lightweight, threshold-based
3. **Real constraints** — domain whitelists, content deny lists, amount limits
4. **Real credentials** — OAuth tokens, bearer tokens, API keys
5. **Real evidence** — audit trail with decision points and timestamps
6. **Failed scenarios** — shows what happens when policy blocks, authority denied, etc.

This is the killer demo — the one that makes people instantly understand what ATP does and why it matters.

## Learn More

- [ATP Specification](../../spec/)
- [SDK Documentation](../../sdk/ts/)
- [Gateway Documentation](../../gateway/)
- [Conformance Tests](../../conformance/)
