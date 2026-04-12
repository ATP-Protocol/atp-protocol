/**
 * @atp-protocol/sdk
 *
 * TypeScript SDK for the Agent Trust Protocol (ATP).
 * Governed execution for AI agents.
 *
 * @packageDocumentation
 *
 * @example Quick start — govern an MCP tool
 * ```typescript
 * import { atpGovern } from "@atp-protocol/sdk";
 *
 * server.tool("send-email", atpGovern({
 *   contract: {
 *     version: "1.0.0",
 *     authority: "org.procurement.send-email",
 *     actions: ["send-email"],
 *     attestation: "full",
 *     approval: { required: true, approver_role: "procurement_manager", timeout: "PT4H" },
 *     credentials: { provider: "gmail-api", scope: ["send"], inject_as: "oauth_token", fail_closed: true }
 *   },
 *   gateway: "https://gateway.your-org.com"
 * }, sendEmailHandler));
 * ```
 *
 * @example Validate a contract
 * ```typescript
 * import { validateContract } from "@atp-protocol/sdk";
 *
 * const result = validateContract(myContract);
 * if (!result.valid) {
 *   console.error(result.errors);
 * }
 * ```
 *
 * @example Evaluate policy locally
 * ```typescript
 * import { evaluatePolicy } from "@atp-protocol/sdk";
 *
 * const result = evaluatePolicy(contract, { recipient: "user@vendor.com", amount: 2500 });
 * if (!result.permitted) {
 *   console.error(result.denial_reason);
 * }
 * ```
 *
 * @example Approval flow
 * ```typescript
 * import { ApprovalFlow } from "@atp-protocol/sdk";
 *
 * const flow = new ApprovalFlow("ctr_123", "send-email", { recipient: "a@b.com" }, "0xWallet");
 * flow.transition("deliver");  // → PENDING_REVIEW
 * flow.transition("approve");  // → APPROVED
 * ```
 */

// Core governance wrapper
export { atpGovern, createGovernedContext, GovernedContext } from "./governance";

// Contract validation and loading
export {
  validateContract,
  isContractExpired,
  requiresApproval,
  parseEscalationPath,
  loadContract,
  loadContracts,
} from "./contract";
export type { ValidationResult, ValidationError, ValidationWarning } from "./contract";

// Policy evaluation
export { evaluatePolicy, mergeConstraints } from "./policy";
export type { PolicyRule, ConstraintRuleType } from "./policy";

// Approval state machine
export { ApprovalFlow, ApprovalError, canTransition, validTriggers } from "./approval";
export type { ApprovalTransition, ApprovalTrigger } from "./approval";

// Evidence recording and backends
export {
  EvidenceBuilder,
  buildEvidence,
  verifyEvidence,
  hashEvidence,
  MemoryEvidenceBackend,
  FileEvidenceBackend,
  DUALEvidenceBackend,
  MultiBackend,
} from "./evidence";
export type {
  EvidenceBackend,
  EvidenceQuery,
  EvidenceQueryResult,
  EvidenceBuildInput,
  EvidenceVerification,
} from "./evidence";

// Credential brokerage
export {
  CredentialStore,
  resolveCredential,
  buildInjectionHeaders,
} from "./credentials";
export type {
  CredentialProvider,
  CredentialResolution,
  StoredCredentialEntry,
} from "./credentials";

// Execution management
export {
  execute,
  classifyOutcome,
  generateIdempotencyKey,
  generateExecutionId,
  isRetryable,
} from "./execution";
export type {
  ExecutionContext,
  ExecutionHooks,
  ExecutionOptions,
  ManagedExecutionResult,
} from "./execution";

// Types
export type {
  // Contract
  ATPContract,
  AttestationLevel,
  IdempotencyModel,
  ApprovalConfig,
  CredentialConfig,
  CredentialInjectionMethod,
  OutputConfig,
  DelegationConfig,
  // Authority
  AuthorityVerification,
  AuthorityDenialReason,
  // Policy
  PolicyEvaluation,
  PolicyConstraint,
  PolicySource,
  ConstraintType,
  // Approval
  ApprovalState,
  ApprovalRecord,
  ApprovalRequest,
  // Execution
  ExecutionOutcome,
  ExecutionRecord,
  // Evidence
  EvidenceRecord,
  EvidenceTimestamps,
  EvidenceStatus,
  // Gateway
  GatewayConfig,
  GatewayMetadata,
  ConformanceLevel,
  // Governance
  GovernOptions,
  GovernedResult,
  DenialContext,
} from "./types";

export { TERMINAL_APPROVAL_STATES } from "./types";
