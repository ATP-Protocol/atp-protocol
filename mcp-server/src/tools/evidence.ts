/**
 * ATP Evidence & Approval Tools
 *
 * Tools for retrieving evidence records, managing approval workflows,
 * and listing pending approvals.
 */

import { z } from "zod";
import { getGateway } from "../gateway-instance";

/**
 * Input schema for atp_get_evidence
 */
export const GetEvidenceInput = z.object({
  evidence_id: z.string().describe("Evidence record ID"),
});

export type GetEvidenceInput = z.infer<typeof GetEvidenceInput>;

/**
 * Retrieve an evidence record by ID.
 *
 * Evidence records provide a complete audit trail for each execution:
 * - What action was requested
 * - Who requested it (wallet)
 * - Which organization they belong to
 * - What policy constraints were evaluated
 * - Whether approval was needed (and by whom)
 * - What credentials were used
 * - What the outcome was
 * - Cryptographic hashes for integrity verification
 *
 * Evidence is captured automatically by atp_govern_execute and stored
 * in the gateway. The attestation level determines how detailed
 * the evidence is:
 * - `full` — complete execution details with hashes
 * - `light` — summary info, minimal hashes
 * - `none` — no evidence capture (not recommended)
 *
 * Use this when: auditing an execution, verifying compliance,
 * investigating failed actions, or generating audit reports.
 */
export async function getEvidenceTool(input: GetEvidenceInput): Promise<object> {
  const gateway = getGateway();

  const evidence = gateway.evidence.get(input.evidence_id);

  if (!evidence) {
    return {
      found: false,
      evidence_id: input.evidence_id,
      error: "Evidence record not found",
    };
  }

  return {
    found: true,
    evidence_id: evidence.evidence_id,
    execution_id: evidence.execution_id,
    contract_id: evidence.contract_id,
    action: evidence.action,
    authority: evidence.authority,
    requesting_wallet: evidence.requesting_wallet,
    requesting_org: evidence.requesting_org,
    outcome: evidence.outcome,
    scope_snapshot: evidence.scope_snapshot,
    approval_id: evidence.approval_id || null,
    credential_provider: evidence.credential_provider || null,
    credential_scope_used: evidence.credential_scope_used || [],
    policy_snapshot: {
      policies_evaluated: (evidence as any).policy_snapshot?.policies_evaluated || 0,
      constraints_applied: (evidence as any).policy_snapshot?.constraints_applied || [],
    },
    timestamps: {
      requested_at: evidence.timestamps.requested_at,
      authorized_at: evidence.timestamps.authorized_at || null,
      approved_at: evidence.timestamps.approved_at || null,
      executed_at: evidence.timestamps.executed_at || null,
      evidenced_at: evidence.timestamps.evidenced_at,
    },
    attestation_level: evidence.attestation_level,
    evidence_status: evidence.evidence_status,
  };
}

/**
 * Input schema for atp_list_pending_approvals
 */
export const ListPendingApprovalsInput = z.object({});

export type ListPendingApprovalsInput = z.infer<typeof ListPendingApprovalsInput>;

/**
 * List all pending approval requests.
 *
 * When atp_govern_execute encounters an action that requires approval,
 * it creates a pending approval request and returns an approval_id.
 * The requesting agent must then ask an approver with the appropriate role
 * to review and approve the request.
 *
 * This tool lists all currently pending requests so approvers can see
 * what needs their attention.
 *
 * Each pending approval includes:
 * - approval_id — use this in atp_approve to approve/deny
 * - contract_id and action — what is being requested
 * - requesting_wallet — who made the request
 * - scope_params — the actual parameters (recipient, amount, etc.)
 * - approver_role — which role must approve this
 * - created_at — when the request was made
 *
 * Use this when: checking for pending approvals, building an approver dashboard,
 * or listing work that needs attention.
 */
export async function listPendingApprovalsTool(
  input: ListPendingApprovalsInput
): Promise<object> {
  const gateway = getGateway();

  const pending = gateway.approvals.listPending();

  return {
    pending_count: pending.length,
    pending_approvals: pending.map((approval) => ({
      approval_id: approval.approval_id,
      contract_id: approval.contract_id,
      action: approval.action,
      requesting_wallet: approval.requesting_wallet,
      approver_role: approval.approver_role,
      scope_params: approval.scope_params,
      created_at: approval.created_at,
      state: approval.state,
    })),
    listed_at: new Date().toISOString(),
  };
}

/**
 * Input schema for atp_approve
 */
export const ApproveInput = z.object({
  approval_id: z.string().describe("ID of the approval request to approve"),
  approver_wallet: z
    .string()
    .describe("Wallet address of the approver (must have the approver_role)"),
  approver_role: z.string().optional().describe("Role of the approver (informational)"),
});

export type ApproveInput = z.infer<typeof ApproveInput>;

/**
 * Approve a pending request and proceed with execution.
 *
 * When a request needs approval (returned by atp_govern_execute with
 * denied_stage: "approval"), an approver with the appropriate role must
 * review and approve it. This tool marks the approval as APPROVED and
 * then immediately re-executes the original action with the approval consumed.
 *
 * The approver_wallet should be bound to the organization with the required
 * approver_role. In a real system, you'd verify this binding before allowing
 * the approval.
 *
 * After approval, the action proceeds through the normal ATP pipeline
 * (policy, credentials, execution, evidence) and completes.
 *
 * Use this when: an approver has reviewed and agreed to the request,
 * and you want to proceed with the original action.
 *
 * Returns the final execution result (not a pending approval anymore).
 */
export async function approveTool(input: ApproveInput): Promise<object> {
  const gateway = getGateway();

  // Look up the pending approval
  const approval = gateway.approvals.get(input.approval_id);

  if (!approval) {
    return {
      approved: false,
      approval_id: input.approval_id,
      error: "Approval not found",
    };
  }

  if (approval.state !== "PENDING_REVIEW") {
    return {
      approved: false,
      approval_id: input.approval_id,
      error: `Approval is in state "${approval.state}", cannot approve`,
    };
  }

  // Mark the approval as approved
  const approved = gateway.approvals.approve(input.approval_id, input.approver_wallet);

  if (!approved) {
    return {
      approved: false,
      approval_id: input.approval_id,
      error: "Failed to approve request",
    };
  }

  // Now re-execute the original action with approval consumed
  const execution = await gateway.executeApproved(
    {
      contract_id: approval.contract_id,
      action: approval.action,
      params: approval.scope_params,
      wallet: approval.requesting_wallet,
    },
    input.approval_id,
    input.approver_wallet
  );

  return {
    approval_id: input.approval_id,
    approved: true,
    approver_wallet: input.approver_wallet,
    approver_role: input.approver_role || approval.approver_role,
    approved_at: new Date().toISOString(),
    // Include the execution result
    execution: {
      execution_id: execution.execution_id,
      outcome: execution.outcome,
      result: execution.result || null,
      evidence_id: execution.evidence_id || null,
      denied_reason: execution.denied_reason || null,
      denied_stage: execution.denied_stage || null,
    },
  };
}
