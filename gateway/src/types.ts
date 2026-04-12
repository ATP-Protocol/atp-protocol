/**
 * ATP Gateway Types
 *
 * Internal types for the reference gateway implementation.
 */

import type { v4 as uuidv4 } from "uuid";

// ---------------------------------------------------------------------------
// Contract (mirrors SDK types for gateway independence)
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
  attestation: "full" | "light" | "none";
  revocable?: boolean;
  expiry?: string;
  idempotency?: "gateway-enforced" | "tool-native" | "unsafe";
  execution_timeout?: string;
  delegation?: { allow_sub_delegation?: boolean; max_depth?: number };
}

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
  inject_as?: "oauth_token" | "api_key" | "bearer_token" | "basic_auth" | "custom";
  fail_closed?: boolean;
}

export interface OutputConfig {
  object_type?: string;
  initial_state?: string;
  schema_ref?: string;
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

export type ExecutionOutcome =
  | "outcome:success"
  | "outcome:failure"
  | "outcome:denied"
  | "outcome:timeout"
  | "outcome:partial"
  | "outcome:unknown";

export interface ExecutionRequest {
  contract_id: string;
  action: string;
  params: Record<string, unknown>;
  wallet: string;
  idempotency_key?: string;
}

export interface ExecutionResponse {
  execution_id: string;
  outcome: ExecutionOutcome;
  result?: unknown;
  evidence_id?: string;
  approval_id?: string;
  denied_reason?: string;
  denied_stage?: "authority" | "policy" | "approval" | "credential" | "execution";
  started_at: string;
  completed_at: string;
}

// ---------------------------------------------------------------------------
// Evidence
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
  approval_id?: string;
  credential_provider?: string;
  credential_scope_used?: string[];
  outcome: ExecutionOutcome;
  request_hash: string;
  response_hash?: string;
  timestamps: {
    requested_at: string;
    authorized_at?: string;
    approved_at?: string;
    executed_at?: string;
    evidenced_at: string;
  };
  gateway_id: string;
  attestation_level: "full" | "light" | "none";
  evidence_status: "confirmed" | "pending" | "failed";
}

// ---------------------------------------------------------------------------
// Authority
// ---------------------------------------------------------------------------

export interface WalletBinding {
  wallet: string;
  org_id: string;
  role: string;
  authorities: string[];
  constraints?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Credentials
// ---------------------------------------------------------------------------

export interface StoredCredential {
  provider: string;
  credential_type: "oauth_token" | "api_key" | "bearer_token" | "basic_auth" | "custom";
  scope: string[];
  value: string; // In production, this would be encrypted or fetched from a vault
  expires_at?: string;
  org_id: string;
}

// ---------------------------------------------------------------------------
// Gateway Config
// ---------------------------------------------------------------------------

export interface GatewayConfig {
  gateway_id: string;
  port: number;
  conformance_level: "aware" | "compatible" | "verified" | "attested";
  dual_integration: boolean;
  execution_timeout_ms: number;
  max_execution_timeout_ms: number;
}
