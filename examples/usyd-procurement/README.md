# USYD Procurement Governance Contract

## Overview

This ATP contract implements governance for University of Sydney procurement operations, specifically the purchase order (PO) lifecycle managed by the AI Hub Finance team.

## Problem Statement

USYD's procurement process involves multiple approval gates, budget controls, and audit requirements. Manual enforcement is error-prone and difficult to audit. This contract codifies procurement policy into a machine-enforceable framework that:

- **Prevents overspend** by requiring explicit approval for POs over $10,000 AUD
- **Ensures policy compliance** by validating cost centres and supplier lists
- **Eliminates unauthorized correspondence** by blocking auto-send on behalf of staff
- **Provides audit trail** via DUAL integration (immutable evidence records)
- **Scales safely** with rate limiting (50 actions/hour per requester)

## Authority & Conformance

- **Authority**: `edu.usyd.aihub` — AI Hub financial operations
- **Conformance Level**: `verified` — tested against ATP conformance suite
- **Version**: 0.1.0
- **Expires**: 2027-04-12 (1-year validity)

## Actions

| Action | Mode | Risk | Purpose |
|--------|------|------|---------|
| `query-budget` | Auto | Low | Check remaining budget for cost centre |
| `validate-supplier` | Auto | Low | Verify supplier on approved list |
| `draft-po` | Conditional | Medium | Create draft PO (not yet committed) |
| `submit-for-approval` | Conditional | High | Submit PO for human approval |
| `send-correspondence` | Explicit | High | Email supplier (always requires approval) |

## Key Policy Rules

1. **$10k threshold**: POs over $10,000 AUD require explicit human approval
2. **Preferred suppliers**: Trusted suppliers can auto-approve POs under threshold
3. **No auto-send**: All correspondence requires explicit approval (fail-safe)
4. **Cost centre validation**: Must match pattern `[A-Z]{2}\d{6}` (e.g., `FN123456`)
5. **Rate limit**: Max 50 procurement actions per hour (prevent abuse/DoS)

## Approval Workflow

```
PO Amount ≤ $10k + Preferred Supplier
  → Auto-approved (no human needed)

PO Amount > $10k OR Non-preferred Supplier
  → Requires explicit approval from procurement_officer
  → 24-hour approval window (escalates to procurement_manager if denied)
  → Max escalation: finance_director
```

## Evidence & Audit

All executions recorded in DUAL as immutable evidence:
- Request timestamp, approver identity, decision rationale
- Credential scope used (procurement:read/write)
- Policy constraints evaluated
- Outcome (approved/denied/timeout)

## Credentials

Provider: `usyd-finance-api`  
Scopes: `procurement:read`, `procurement:write`  
Injection: `bearer_token`  
Fail-closed: `true` (deny if credentials unavailable)

## Usage Example

```typescript
import { GovernedTool } from "@atp-protocol/sdk";
import { usydProcurementContract } from "./contract";

const procurement = new GovernedTool({
  contract: usydProcurementContract,
  wallet: "0xStaffWallet123",
  org_id: "org_usyd_aihub",
  onApprovalRequired: (req) => {
    // Notify procurement officer for human approval
  },
});

// Auto-approved: preferred supplier, under threshold
await procurement.invoke({
  action: "draft-po",
  amount_aud: 5000,
  supplier_id: "SUP-APPLE-001", // on preferred list
  cost_centre: "FN123456",
});

// Denied: over threshold, requires approval
await procurement.invoke({
  action: "submit-for-approval",
  amount_aud: 15000,
  supplier_id: "SUP-ACME-001",
  cost_centre: "FN123456",
});
// → Triggers approval workflow
```

## Governance Benefits

- **Audit compliance**: Every action recorded with full context
- **Policy enforcement**: Rules codified, not documented
- **Separation of duties**: Auto-approval vs. explicit approval tracks responsibility
- **Fail-safe defaults**: Correspondence always requires approval (no accidents)
- **Scalable control**: Rate limiting prevents abuse without per-action overhead
