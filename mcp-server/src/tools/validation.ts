/**
 * ATP Validation Tools
 *
 * Tools for validating contracts, evaluating policies, and checking approval requirements.
 */

import { z } from "zod";
import {
  validateContract,
  evaluatePolicy,
  requiresApproval,
  parseEscalationPath,
} from "@atp-protocol/sdk";
import type { ATPContract } from "@atp-protocol/sdk";

/**
 * Input schema for atp_validate_contract
 */
export const ValidateContractInput = z.object({
  contract: z.record(z.unknown()).describe("ATP contract object to validate"),
});

export type ValidateContractInput = z.infer<typeof ValidateContractInput>;

/**
 * Validate an ATP execution contract for correctness and completeness.
 *
 * This tool checks that a contract conforms to the ATP specification:
 * - Required fields are present (version, authority, actions, attestation)
 * - Field values are valid for their types
 * - Nested structures (approval, credentials, etc.) are well-formed
 * - No deprecated or conflicting field combinations exist
 *
 * Use this when: loading a new contract, auditing contract configurations,
 * or debugging policy issues.
 */
export async function validateContractTool(
  input: ValidateContractInput
): Promise<object> {
  const result = validateContract(input.contract as unknown as ATPContract);

  return {
    valid: result.valid,
    errors: result.errors || [],
    warnings: result.warnings || [],
    validated_at: new Date().toISOString(),
  };
}

/**
 * Input schema for atp_evaluate_policy
 */
export const EvaluatePolicyInput = z.object({
  contract: z.record(z.unknown()).describe("ATP contract containing policy rules"),
  params: z
    .record(z.unknown())
    .describe("Request parameters to evaluate against the contract's policy"),
});

export type EvaluatePolicyInput = z.infer<typeof EvaluatePolicyInput>;

/**
 * Evaluate request parameters against a contract's policy constraints.
 *
 * This tool checks whether specific request parameters (recipient, amount, etc.)
 * are permitted by the contract's policy. Policies may include:
 * - Enumeration constraints (only these values allowed)
 * - Numeric bounds (amount must be between X and Y)
 * - Pattern matching (email must match domain list)
 * - Temporal constraints (only during business hours)
 * - Rate limits or size limits
 *
 * Use this when: validating a request before sending it to the gateway,
 * understanding why a request failed policy check, or testing policy rules.
 *
 * Note: This is a LOCAL check and does NOT require gateway connection.
 * It does not check authority or approval — see atp_check_approval for that.
 */
export async function evaluatePolicyTool(input: EvaluatePolicyInput): Promise<object> {
  const result = evaluatePolicy(
    input.contract as unknown as ATPContract,
    input.params
  );

  return {
    permitted: result.permitted,
    policies_evaluated: result.policies_evaluated,
    constraints_applied: result.constraints_applied,
    denial_reason: result.denial_reason || null,
    denial_source: result.denial_source || null,
    evaluated_at: new Date().toISOString(),
  };
}

/**
 * Input schema for atp_check_approval
 */
export const CheckApprovalInput = z.object({
  contract: z.record(z.unknown()).describe("ATP contract"),
  amount: z
    .number()
    .optional()
    .describe("Optional amount for required_above threshold checks"),
});

export type CheckApprovalInput = z.infer<typeof CheckApprovalInput>;

/**
 * Check if a contract requires approval for given parameters.
 *
 * This tool determines whether an action requires approval based on the contract's
 * approval configuration:
 * - If approval.required is false, returns false
 * - If approval.required_above is set, compares against the provided amount
 * - Returns the approver role and escalation path if approval is needed
 *
 * This is useful for understanding the approval workflow BEFORE making an execution request.
 * It does NOT create an approval request — that happens automatically in atp_govern_execute.
 *
 * Use this when: displaying approval requirements to the user, building UI flows,
 * or understanding why a request will need approval.
 */
export async function checkApprovalTool(input: CheckApprovalInput): Promise<object> {
  const contract = input.contract as unknown as ATPContract;
  const isRequired = requiresApproval(contract, input.amount);

  let approverRole = null;
  let escalationPath = null;

  if (isRequired && contract.approval?.approver_role) {
    approverRole = contract.approval.approver_role;

    try {
      escalationPath = parseEscalationPath(contract);
    } catch {
      escalationPath = null;
    }
  }

  return {
    approval_required: isRequired,
    approver_role: approverRole,
    escalation_path: escalationPath,
    approval_timeout: contract.approval?.timeout || null,
    checked_at: new Date().toISOString(),
  };
}
