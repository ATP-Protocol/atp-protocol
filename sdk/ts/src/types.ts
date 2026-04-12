/**
 * ATP SDK Core Types
 *
 * Type definitions for the Agent Trust Protocol.
 * These types map directly to the ATP specification (v1.0.0-draft.2).
 */

// ---------------------------------------------------------------------------
// Contract Types (Spec Section 4)
// ---------------------------------------------------------------------------

export interface ATPContract {
  version: string;
  authority: string;
  template?: string;
  actions: string[];
  scope?: Record<string, unknown>;
  approval?: ApprovalConfig;
  credentials?: CredentialConfig;
  output?: OutputConfig;
  attestation: AttestationLevel;
  revocable?: boolean;
  expiry?: string;
  idempotency?: IdempotencyModel;
  execution_timeout?: string;
  delegation?: DelegationConfig;
}

export type AttestationLevel = "full" | "light" | "none";

export type IdempotencyModel = "gateway-enforced" | "tool-native" | "unsafe";

export interface ApprovalConfig {
  required?: boolean;
  required_above?: number | null;
  approver_role?: string;
  timeout?: string;
  escalation_path?: string;
}

export interface CredentialConfig {
  provider?: string;
  scope?: string[];
  inject_as?: CredentialInjectionMethod;
  fail_closed?: boolean;
}

export type CredentialInjectionMethod =
  | "oauth_token"
  | "api_key"
  | "bearer_token"
  | "basic_auth"
  | "custom";

export interface OutputConfig {
  object_type?: string;
  initial_state?: string;
  schema_ref?: string;
}

export interface DelegationConfig {
  allow_sub_delegation?: boolean;
  max_depth?: number;
}

// ---------------------------------------------------------------------------
// Authority Types (Spec Section 5)
// ---------------------------------------------------------------------------

export interface AuthorityVerification {
  authorized: boolean;
  authority: string;
  wallet: string;
  org_id: string;
  role: string;
  constraints_applied: string[];
  resolved_at: string;
  denial_reason?: AuthorityDenialReason;
}

export type AuthorityDenialReason =
  | "wallet_not_bound"
  | "role_missing_authority"
  | "policy_override_deny"
  | "contract_expired"
  | "contract_revoked"
  | "federation_not_established";

// ---------------------------------------------------------------------------
// Policy Types (Spec Section 6)
// ---------------------------------------------------------------------------

export interface PolicyEvaluation {
  permitted: boolean;
  policies_evaluated: number;
  constraints_applied: PolicyConstraint[];
  evaluated_at: string;
  denial_reason?: string;
  denial_source?: PolicySource;
}

export interface PolicyConstraint {
  source: PolicySource;
  field: string;
  value: unknown;
}

export type PolicySource = "organization" | "template" | "contract" | "runtime";

export type ConstraintType =
  | "enumeration"
  | "numeric_bound"
  | "pattern"
  | "temporal"
  | "boolean"
  | "deny_list"
  | "rate_limit"
  | "size_limit";

// ---------------------------------------------------------------------------
// Approval Types (Spec Section 7)
// ---------------------------------------------------------------------------

export type ApprovalState =
  | "NONE"
  | "REQUESTED"
  | "PENDING_REVIEW"
  | "APPROVED"
  | "DENIED"
  | "EXPIRED"
  | "ESCALATED"
  | "DENIED_TIMEOUT"
  | "REVOKED";

export const TERMINAL_APPROVAL_STATES: ReadonlySet<ApprovalState> = new Set([
  "APPROVED",
  "DENIED",
  "DENIED_TIMEOUT",
  "REVOKED",
]);

export interface ApprovalRecord {
  approval_id: string;
  contract_id: string;
  action: string;
  scope_hash: string;
  requesting_wallet: string;
  approver_wallet?: string;
  approver_role: string;
  decision: "approved" | "denied" | "expired" | "revoked" | "superseded";
  decided_at?: string;
  nonce: string;
  escalation_depth: number;
}

export interface ApprovalRequest {
  contract_id: string;
  action: string;
  scope_params: Record<string, unknown>;
  requesting_wallet: string;
  nonce: string;
}

// ---------------------------------------------------------------------------
// Execution Types (Spec Section 9)
// ---------------------------------------------------------------------------

export type ExecutionOutcome =
  | "outcome:success"
  | "outcome:failure"
  | "outcome:denied"
  | "outcome:timeout"
  | "outcome:partial"
  | "outcome:unknown";

export interface ExecutionRecord {
  execution_id: string;
  contract_id: string;
  action: string;
  outcome: ExecutionOutcome;
  request_hash: string;
  response_summary?: {
    status_code?: number;
    body_hash?: string;
  };
  credential_provider?: string;
  credential_scope_used?: string[];
  approval_id?: string;
  started_at: string;
  completed_at?: string;
  idempotency_key: string;
  gateway_id: string;
}

// ---------------------------------------------------------------------------
// Evidence Types (Spec Section 10)
// ---------------------------------------------------------------------------

export interface EvidenceRecord {
  evidence_id: string;
  execution_id: string;
  contract_id: string;
  authority: string;
  requesting_wallet: string;
  requesting_org: string;
  action: string;
  scope_snapshot: Record<string, unknown>;
  approval?: ApprovalRecord;
  credential_path: {
    provider: string;
    scope_used: string[];
    injection_method: CredentialInjectionMethod;
  };
  outcome: ExecutionOutcome;
  request_hash: string;
  response_hash?: string;
  policy_snapshot: {
    policies_evaluated: number;
    constraints_applied: PolicyConstraint[];
  };
  timestamps: EvidenceTimestamps;
  gateway_id: string;
  attestation_level: AttestationLevel;
  attestation_ref?: string;
  evidence_status?: EvidenceStatus;
}

export interface EvidenceTimestamps {
  requested_at: string;
  authorized_at?: string;
  approved_at?: string;
  executed_at?: string;
  evidenced_at: string;
}

export type EvidenceStatus = "confirmed" | "pending" | "failed";

// ---------------------------------------------------------------------------
// Gateway Types
// ---------------------------------------------------------------------------

export interface GatewayConfig {
  url: string;
  wallet?: string;
  timeout?: number;
  retries?: number;
}

export interface GatewayMetadata {
  gateway_id: string;
  atp_version: string;
  conformance_level: ConformanceLevel;
  conformance_suite_version?: string;
  conformance_verified_at?: string;
  dual_integration: boolean;
}

export type ConformanceLevel = "aware" | "compatible" | "verified" | "attested";

// ---------------------------------------------------------------------------
// Governance Wrapper Types
// ---------------------------------------------------------------------------

export interface GovernOptions {
  contract: string | ATPContract;
  gateway: string | GatewayConfig;
  wallet?: string;
  onApprovalRequired?: (request: ApprovalRequest) => Promise<void>;
  onEvidenceCaptured?: (evidence: EvidenceRecord) => Promise<void>;
  onDenied?: (reason: string, context: DenialContext) => Promise<void>;
}

export interface DenialContext {
  stage: "authority" | "policy" | "approval" | "credential" | "execution";
  contract_id?: string;
  action?: string;
  details: Record<string, unknown>;
}

export interface GovernedResult<T = unknown> {
  outcome: ExecutionOutcome;
  result?: T;
  execution_id: string;
  evidence_id?: string;
  approval_id?: string;
  denied_reason?: string;
  denied_stage?: DenialContext["stage"];
}
