/**
 * ATP Reference Gateway
 *
 * Core gateway engine that orchestrates the full governed execution flow:
 * Authority → Policy → Approval → Credentials → Execution → Evidence
 *
 * This is the reference implementation of the ATP gateway (Spec Sections 5-11).
 */

import { v4 as uuidv4 } from "uuid";
import type {
  ATPContract,
  ExecutionRequest,
  ExecutionResponse,
  ExecutionOutcome,
  GatewayConfig,
} from "./types";
import {
  ContractStore,
  AuthorityStore,
  CredentialStore,
  EvidenceStore,
  IdempotencyStore,
  ApprovalStore,
} from "./store";
import { checkAuthority } from "./middleware/authority";
import { evaluatePolicy } from "./middleware/policy";
import { resolveCredentials, buildInjection } from "./middleware/credentials";
import { captureEvidence } from "./middleware/evidence";
import { generateIdempotencyKey, generateExecutionId, parseDuration } from "./util";

export type ToolHandler = (
  params: Record<string, unknown>,
  injectedHeaders?: Record<string, string>
) => Promise<{ status: number; body: unknown }>;

export interface RegisteredTool {
  action: string;
  contract_id: string;
  handler: ToolHandler;
}

export class ATPGateway {
  readonly config: GatewayConfig;
  readonly contracts: ContractStore;
  readonly authority: AuthorityStore;
  readonly credentials: CredentialStore;
  readonly evidence: EvidenceStore;
  readonly idempotency: IdempotencyStore;
  readonly approvals: ApprovalStore;

  private tools = new Map<string, RegisteredTool>();
  private gatewaySecret: string;

  constructor(config?: Partial<GatewayConfig>) {
    this.config = {
      gateway_id: config?.gateway_id ?? `gw_${uuidv4().slice(0, 8)}`,
      port: config?.port ?? 3100,
      conformance_level: config?.conformance_level ?? "verified",
      dual_integration: config?.dual_integration ?? false,
      execution_timeout_ms: config?.execution_timeout_ms ?? 30_000,
      max_execution_timeout_ms: config?.max_execution_timeout_ms ?? 300_000,
    };

    this.contracts = new ContractStore();
    this.authority = new AuthorityStore();
    this.credentials = new CredentialStore();
    this.evidence = new EvidenceStore();
    this.idempotency = new IdempotencyStore();
    this.approvals = new ApprovalStore();
    this.gatewaySecret = uuidv4(); // In production, loaded from secure config
  }

  /**
   * Register an MCP tool with ATP governance.
   */
  registerTool(action: string, contractId: string, handler: ToolHandler): void {
    this.tools.set(action, { action, contract_id: contractId, handler });
  }

  /**
   * Execute a governed action through the full ATP pipeline.
   *
   * Flow: Authority → Policy → Approval → Credentials → Execute → Evidence
   */
  async execute(request: ExecutionRequest): Promise<ExecutionResponse> {
    const executionId = generateExecutionId();
    const startedAt = new Date().toISOString();

    // ---------------------------------------------------------------------------
    // 0. Resolve contract
    // ---------------------------------------------------------------------------
    const contract = this.contracts.get(request.contract_id);
    if (!contract) {
      return this.denied(executionId, startedAt, "authority", `Contract "${request.contract_id}" not found`);
    }

    // Verify action is in contract
    if (!contract.actions.includes(request.action)) {
      return this.denied(executionId, startedAt, "authority", `Action "${request.action}" not permitted by contract`);
    }

    // ---------------------------------------------------------------------------
    // 1. Idempotency check (Spec Section 11.1)
    // ---------------------------------------------------------------------------
    const idempotencyKey = request.idempotency_key ?? generateIdempotencyKey(
      this.gatewaySecret,
      request.contract_id,
      request.action,
      request.params,
      request.wallet,
      uuidv4()
    );

    if (contract.idempotency === "gateway-enforced") {
      const existing = this.idempotency.check(idempotencyKey);
      if (existing) {
        return existing; // Return cached result — no re-execution
      }
    }

    // ---------------------------------------------------------------------------
    // 2. Authority check (Spec Section 5)
    // ---------------------------------------------------------------------------
    const authResult = checkAuthority(request.wallet, contract, this.authority);
    if (!authResult.authorized) {
      const response = this.denied(executionId, startedAt, "authority", authResult.denial_reason!);
      this.captureEvidenceForDenial(executionId, contract, request, "authority", authResult.denial_reason!, startedAt);
      return response;
    }

    // ---------------------------------------------------------------------------
    // 3. Policy evaluation (Spec Section 6)
    // ---------------------------------------------------------------------------
    const policyResult = evaluatePolicy(contract, request.params);
    if (!policyResult.permitted) {
      const response = this.denied(executionId, startedAt, "policy", policyResult.denial_reason!);
      this.captureEvidenceForDenial(executionId, contract, request, "policy", policyResult.denial_reason!, startedAt);
      return response;
    }

    // ---------------------------------------------------------------------------
    // 4. Approval gate (Spec Section 7)
    // ---------------------------------------------------------------------------
    const authorizedAt = new Date().toISOString();

    if (contract.approval?.required) {
      const amount = typeof request.params.amount === "number" ? request.params.amount : undefined;
      const needsApproval = contract.approval.required_above === null
        || contract.approval.required_above === undefined
        || (amount !== undefined && amount > contract.approval.required_above);

      if (needsApproval) {
        // Create pending approval
        const approvalId = `apr_${uuidv4().slice(0, 12)}`;
        this.approvals.create({
          approval_id: approvalId,
          contract_id: request.contract_id,
          action: request.action,
          scope_params: request.params,
          requesting_wallet: request.wallet,
          approver_role: contract.approval.approver_role ?? "admin",
          state: "PENDING_REVIEW",
          created_at: new Date().toISOString(),
          nonce: uuidv4(),
        });

        // For the reference gateway, return a pending response.
        // In production, this would block (sync) or return a polling reference (async).
        return {
          execution_id: executionId,
          outcome: "outcome:denied",
          denied_reason: `Approval required from role "${contract.approval.approver_role}". Approval ID: ${approvalId}`,
          denied_stage: "approval",
          started_at: startedAt,
          completed_at: new Date().toISOString(),
        };
      }
    }

    // ---------------------------------------------------------------------------
    // 5. Credential resolution (Spec Section 8)
    // ---------------------------------------------------------------------------
    const credResult = resolveCredentials(contract, authResult.org_id!, this.credentials);
    if (!credResult.resolved) {
      const response = this.denied(executionId, startedAt, "credential", credResult.denial_reason!);
      this.captureEvidenceForDenial(executionId, contract, request, "credential", credResult.denial_reason!, startedAt);
      return response;
    }

    const injectedHeaders = credResult.credential
      ? buildInjection(credResult.credential, credResult.injection_method)
      : undefined;

    // ---------------------------------------------------------------------------
    // 6. Execution (Spec Section 9)
    // ---------------------------------------------------------------------------
    const tool = this.tools.get(request.action);
    if (!tool) {
      return this.denied(executionId, startedAt, "execution", `No handler registered for action "${request.action}"`);
    }

    const executionTimeout = contract.execution_timeout
      ? Math.min(parseDuration(contract.execution_timeout), this.config.max_execution_timeout_ms)
      : this.config.execution_timeout_ms;

    let outcome: ExecutionOutcome;
    let result: unknown;

    try {
      const response = await Promise.race([
        tool.handler(request.params, injectedHeaders),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("EXECUTION_TIMEOUT")), executionTimeout)
        ),
      ]);

      // Classify outcome (Spec Section 9.3)
      // Note: 202 must be checked BEFORE the 2xx range
      if (response.status === 202) {
        outcome = "outcome:unknown"; // Accepted but no confirmation
      } else if (response.status >= 200 && response.status < 300) {
        outcome = "outcome:success";
      } else if (response.status >= 400) {
        outcome = "outcome:failure";
      } else {
        outcome = "outcome:unknown";
      }
      result = response.body;
    } catch (error) {
      if (error instanceof Error && error.message === "EXECUTION_TIMEOUT") {
        outcome = "outcome:timeout";
      } else {
        outcome = "outcome:failure";
        result = { error: error instanceof Error ? error.message : "Unknown error" };
      }
    }

    const completedAt = new Date().toISOString();

    // ---------------------------------------------------------------------------
    // 7. Evidence capture (Spec Section 10)
    // ---------------------------------------------------------------------------
    const evidenceRecord = captureEvidence(
      {
        execution_id: executionId,
        contract: contract,
        authority: contract.authority,
        requesting_wallet: request.wallet,
        requesting_org: authResult.org_id!,
        action: request.action,
        scope_snapshot: request.params,
        credential_provider: credResult.provider,
        credential_scope_used: credResult.scope_used,
        outcome,
        request_payload: request.params,
        response_payload: result,
        timestamps: {
          requested_at: startedAt,
          authorized_at: authorizedAt,
          executed_at: completedAt,
        },
        gateway_id: this.config.gateway_id,
      },
      this.evidence
    );

    // ---------------------------------------------------------------------------
    // 8. Build response
    // ---------------------------------------------------------------------------
    const executionResponse: ExecutionResponse = {
      execution_id: executionId,
      outcome,
      result: (outcome === "outcome:success" || outcome === ("outcome:partial" as ExecutionOutcome)) ? result : undefined,
      evidence_id: evidenceRecord.evidence_id,
      started_at: startedAt,
      completed_at: completedAt,
    };

    // Record for idempotency
    if (contract.idempotency === "gateway-enforced") {
      this.idempotency.record(idempotencyKey, executionResponse);
    }

    return executionResponse;
  }

  /**
   * Execute a pre-approved action. Skips the approval gate.
   */
  async executeApproved(
    request: ExecutionRequest,
    approvalId: string,
    approverWallet: string
  ): Promise<ExecutionResponse> {
    // Verify and consume the approval
    const approval = this.approvals.get(approvalId);
    if (!approval) {
      return this.denied(generateExecutionId(), new Date().toISOString(), "approval", "Approval not found");
    }

    if (approval.state !== "APPROVED") {
      return this.denied(
        generateExecutionId(),
        new Date().toISOString(),
        "approval",
        `Approval state is "${approval.state}", expected "APPROVED"`
      );
    }

    // Verify binding: approval must match the request
    if (approval.contract_id !== request.contract_id || approval.action !== request.action) {
      return this.denied(
        generateExecutionId(),
        new Date().toISOString(),
        "approval",
        "Approval does not match the execution request (contract or action mismatch)"
      );
    }

    // Approval is consumed — proceed with execution (skipping approval gate)
    // Mark the contract's approval as consumed by temporarily disabling it
    const contract = this.contracts.get(request.contract_id);
    if (!contract) {
      return this.denied(generateExecutionId(), new Date().toISOString(), "authority", "Contract not found");
    }

    const savedApproval = contract.approval;
    contract.approval = { required: false }; // Temporarily disable
    const result = await this.execute(request);
    contract.approval = savedApproval; // Restore
    result.approval_id = approvalId;

    return result;
  }

  /**
   * Get gateway metadata for conformance declaration.
   */
  getMetadata() {
    return {
      gateway_id: this.config.gateway_id,
      atp_version: "1.0.0",
      conformance_level: this.config.conformance_level,
      dual_integration: this.config.dual_integration,
    };
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private denied(
    executionId: string,
    startedAt: string,
    stage: "authority" | "policy" | "approval" | "credential" | "execution",
    reason: string
  ): ExecutionResponse {
    return {
      execution_id: executionId,
      outcome: "outcome:denied",
      denied_reason: reason,
      denied_stage: stage,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
    };
  }

  private captureEvidenceForDenial(
    executionId: string,
    contract: ATPContract & { id: string },
    request: ExecutionRequest,
    stage: string,
    reason: string,
    startedAt: string
  ): void {
    if (contract.attestation === "none") return;

    captureEvidence(
      {
        execution_id: executionId,
        contract,
        authority: contract.authority,
        requesting_wallet: request.wallet,
        requesting_org: "unknown",
        action: request.action,
        scope_snapshot: request.params,
        outcome: "outcome:denied",
        request_payload: request.params,
        timestamps: { requested_at: startedAt },
        gateway_id: this.config.gateway_id,
      },
      this.evidence
    );
  }
}
