#!/usr/bin/env node

/**
 * USYD Procurement Governance Contract
 *
 * Authority: edu.usyd.aihub
 * Contract ID: usyd.procurement.raise-po
 * Version: 0.1.0
 * Conformance Level: verified
 *
 * This contract defines the ATP governance framework for University of Sydney
 * procurement operations, specifically purchase order (PO) lifecycle management.
 *
 * It enforces policy rules on:
 * - Budget approval thresholds ($10k AUD)
 * - Supplier validation against preferred supplier lists
 * - Cost centre authorization (validated patterns)
 * - Explicit approval for all correspondence actions
 * - Rate limiting to prevent abuse
 */

import type { ATPContract } from "@atp-protocol/sdk";

export const usydProcurementContract: ATPContract = {
  // ============================================================================
  // IDENTITY & VERSION
  // ============================================================================

  version: "0.1.0",
  authority: "edu.usyd.aihub",
  attestation: "light",

  // ============================================================================
  // ACTIONS: Five core procurement operations
  // ============================================================================

  actions: [
    "query-budget", // Read-only: check remaining budget for cost centre
    "validate-supplier", // Read-only: check if supplier on preferred list
    "draft-po", // Create draft PO (not committed)
    "submit-for-approval", // Submit PO to approval workflow
    "send-correspondence", // Send email to supplier on behalf of staff
  ],

  // ============================================================================
  // SCOPE: Policy constraints & approval rules
  // ============================================================================

  scope: {
    // Budget threshold: POs over $10k require explicit human approval
    approval_threshold_aud: 10000,

    // Allowed cost centre format: uppercase 2-letter prefix + 6 digits
    // Examples: FN123456 (Finance), HR654321 (HR), ST999999 (Strategic)
    cost_centre_pattern: "^[A-Z]{2}\\d{6}$",

    // Rate limiting: max 50 procurement actions per hour per wallet
    rate_limit: {
      actions_per_hour: 50,
      window_seconds: 3600,
    },

    // Action-level policies
    action_policies: {
      "query-budget": {
        approval_mode: "auto",
        requires_supplier_check: false,
        risk_level: "low",
      },
      "validate-supplier": {
        approval_mode: "auto",
        requires_supplier_check: false,
        risk_level: "low",
      },
      "draft-po": {
        approval_mode: "conditional", // conditional on amount
        requires_supplier_check: true,
        risk_level: "medium",
      },
      "submit-for-approval": {
        approval_mode: "conditional", // conditional on amount
        requires_supplier_check: true,
        risk_level: "high",
      },
      "send-correspondence": {
        approval_mode: "explicit", // ALWAYS explicit — never auto-send on behalf
        requires_supplier_check: false,
        risk_level: "high",
      },
    },

    // Conditional approval rules
    conditional_approval: {
      "draft-po": [
        {
          condition: "amount_aud > 10000",
          action: "require_explicit_approval",
          reason: "High-value POs require human review",
        },
        {
          condition: "supplier_status === 'preferred'",
          action: "allow_auto_approval",
          reason: "Trusted suppliers can auto-approve under threshold",
        },
      ],
      "submit-for-approval": [
        {
          condition: "amount_aud > 10000",
          action: "require_explicit_approval",
          reason: "Submission of high-value POs requires approval",
        },
      ],
    },
  },

  // ============================================================================
  // APPROVAL CONFIGURATION
  // ============================================================================

  approval: {
    required: true,
    required_above: 10000, // amounts > $10k require approval
    approver_role: "procurement_officer", // or procurement_manager for escalation
    timeout: "PT24H", // 24-hour approval window (ISO 8601)
    escalation_path: "procurement_officer→procurement_manager→finance_director",
  },

  // ============================================================================
  // CREDENTIAL CONFIGURATION
  // ============================================================================

  credentials: {
    provider: "usyd-finance-api",
    scope: ["procurement:read", "procurement:write"],
    inject_as: "bearer_token",
    fail_closed: true, // Deny access if credentials unavailable (safe default)
  },

  // ============================================================================
  // OUTPUT CONFIGURATION
  // ============================================================================

  output: {
    object_type: "po_document", // Purchase order
    schema_ref: "usyd/po-schema/v1",
    initial_state: "draft", // POs begin in draft state
  },

  // ============================================================================
  // EXECUTION CONSTRAINTS
  // ============================================================================

  execution_timeout: "PT30S", // 30-second timeout for API calls
  idempotency: "gateway-enforced", // Gateway ensures idempotent execution
  revocable: true, // Contracts can be revoked if policy changes
  expiry: "2027-04-12T23:59:59Z", // 1-year expiry; renewal required

  // ============================================================================
  // DELEGATION CONFIGURATION
  // ============================================================================

  delegation: {
    allow_sub_delegation: false, // No recursive delegation for financial actions
    max_depth: 0,
  },
};

// ============================================================================
// EXPORT: Named export for use in ATP governance workflows
// ============================================================================

export default usydProcurementContract;

// ============================================================================
// TYPE ASSERTION: Ensure TypeScript validates against ATPContract interface
// ============================================================================

const _typeCheck: ATPContract = usydProcurementContract;
