/**
 * Evidence Recorder
 *
 * Builds, hashes, and verifies ATP evidence records without requiring a gateway.
 * Follows ATP Spec Section 10 — Evidence & Attestation.
 */

import { createHash, randomBytes } from "crypto";
import type {
  EvidenceRecord,
  EvidenceTimestamps,
  ExecutionOutcome,
  AttestationLevel,
  PolicyConstraint,
  CredentialInjectionMethod,
  ApprovalRecord,
} from "../types";
import type { EvidenceBackend } from "./backends";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EvidenceBuildInput {
  /** Contract identifier. */
  contract_id: string;
  /** Execution identifier (must be unique per execution). */
  execution_id: string;
  /** Resolved authority string (e.g. "org.iantest.commerce-agent"). */
  authority: string;
  /** Wallet address that initiated the request. */
  requesting_wallet: string;
  /** Organization ID the wallet belongs to. */
  requesting_org: string;
  /** Action name from the contract. */
  action: string;
  /** Snapshot of the scope parameters at execution time. */
  scope_snapshot: Record<string, unknown>;
  /** Execution outcome. */
  outcome: ExecutionOutcome;
  /** Raw request payload (will be hashed, not stored). */
  request_payload: unknown;
  /** Raw response payload (will be hashed, not stored). Optional. */
  response_payload?: unknown;
  /** Attestation level from the contract. */
  attestation_level: AttestationLevel;
  /** Gateway identifier. */
  gateway_id: string;
  /** Approval record if approval was required. */
  approval?: ApprovalRecord;
  /** Credential metadata (never the credential value itself). */
  credential_path?: {
    provider: string;
    scope_used: string[];
    injection_method: CredentialInjectionMethod;
  };
  /** Policy evaluation snapshot. */
  policy_snapshot?: {
    policies_evaluated: number;
    constraints_applied: PolicyConstraint[];
  };
  /** Override timestamps (useful for testing). */
  timestamps?: Partial<EvidenceTimestamps>;
}

export interface EvidenceVerification {
  /** Whether the evidence record is internally consistent. */
  valid: boolean;
  /** Specific checks performed. */
  checks: {
    request_hash_valid: boolean;
    response_hash_valid: boolean;
    timestamps_ordered: boolean;
    required_fields_present: boolean;
    evidence_id_format: boolean;
  };
  /** Reasons for failure, if any. */
  errors: string[];
}

// ---------------------------------------------------------------------------
// Evidence Builder (fluent API)
// ---------------------------------------------------------------------------

/**
 * Fluent builder for constructing evidence records step by step.
 *
 * @example
 * ```typescript
 * import { EvidenceBuilder } from "@atp-protocol/sdk/evidence";
 *
 * const evidence = new EvidenceBuilder("ctr_123", "exe_abc", "send-email")
 *   .authority("org.procurement.send-email")
 *   .wallet("0xAgent", "org_456")
 *   .outcome("outcome:success")
 *   .request({ to: "vendor@example.com", subject: "PO #789" })
 *   .response({ status: 200, message_id: "msg_xyz" })
 *   .attestation("full", "gw_main")
 *   .build();
 * ```
 */
export class EvidenceBuilder {
  private input: Partial<EvidenceBuildInput> = {};

  constructor(contractId: string, executionId: string, action: string) {
    this.input.contract_id = contractId;
    this.input.execution_id = executionId;
    this.input.action = action;
  }

  authority(authority: string): this {
    this.input.authority = authority;
    return this;
  }

  wallet(address: string, orgId: string): this {
    this.input.requesting_wallet = address;
    this.input.requesting_org = orgId;
    return this;
  }

  scope(snapshot: Record<string, unknown>): this {
    this.input.scope_snapshot = snapshot;
    return this;
  }

  outcome(outcome: ExecutionOutcome): this {
    this.input.outcome = outcome;
    return this;
  }

  request(payload: unknown): this {
    this.input.request_payload = payload;
    return this;
  }

  response(payload: unknown): this {
    this.input.response_payload = payload;
    return this;
  }

  approval(record: ApprovalRecord): this {
    this.input.approval = record;
    return this;
  }

  credentials(
    provider: string,
    scopeUsed: string[],
    method: CredentialInjectionMethod
  ): this {
    this.input.credential_path = {
      provider,
      scope_used: scopeUsed,
      injection_method: method,
    };
    return this;
  }

  policy(evaluated: number, constraints: PolicyConstraint[]): this {
    this.input.policy_snapshot = {
      policies_evaluated: evaluated,
      constraints_applied: constraints,
    };
    return this;
  }

  attestation(level: AttestationLevel, gatewayId: string): this {
    this.input.attestation_level = level;
    this.input.gateway_id = gatewayId;
    return this;
  }

  timestamps(ts: Partial<EvidenceTimestamps>): this {
    this.input.timestamps = ts;
    return this;
  }

  /**
   * Build the evidence record. Throws if required fields are missing.
   */
  build(): EvidenceRecord {
    const required: (keyof EvidenceBuildInput)[] = [
      "contract_id",
      "execution_id",
      "authority",
      "requesting_wallet",
      "requesting_org",
      "action",
      "outcome",
      "request_payload",
      "attestation_level",
      "gateway_id",
    ];

    for (const field of required) {
      if (this.input[field] === undefined) {
        throw new Error(`EvidenceBuilder: missing required field "${field}"`);
      }
    }

    return buildEvidence(this.input as EvidenceBuildInput);
  }

  /**
   * Build and immediately store to a backend.
   */
  async buildAndStore(backend: EvidenceBackend): Promise<EvidenceRecord> {
    const record = this.build();
    await backend.store(record);
    return record;
  }
}

// ---------------------------------------------------------------------------
// Functional API
// ---------------------------------------------------------------------------

/**
 * Build an evidence record from input parameters.
 * Hashes request/response payloads and generates a unique evidence ID.
 */
export function buildEvidence(input: EvidenceBuildInput): EvidenceRecord {
  const now = new Date().toISOString();
  const evidenceId = generateEvidenceId();

  const record: EvidenceRecord = {
    evidence_id: evidenceId,
    execution_id: input.execution_id,
    contract_id: input.contract_id,
    authority: input.authority,
    requesting_wallet: input.requesting_wallet,
    requesting_org: input.requesting_org,
    action: input.action,
    scope_snapshot: input.scope_snapshot ?? {},
    approval: input.approval,
    credential_path: input.credential_path ?? {
      provider: "none",
      scope_used: [],
      injection_method: "custom",
    },
    outcome: input.outcome,
    request_hash: sha256(canonicalJson(input.request_payload)),
    response_hash: input.response_payload
      ? sha256(canonicalJson(input.response_payload))
      : undefined,
    policy_snapshot: input.policy_snapshot ?? {
      policies_evaluated: 0,
      constraints_applied: [],
    },
    timestamps: {
      requested_at: input.timestamps?.requested_at ?? now,
      authorized_at: input.timestamps?.authorized_at,
      approved_at: input.timestamps?.approved_at,
      executed_at: input.timestamps?.executed_at ?? now,
      evidenced_at: now,
    },
    gateway_id: input.gateway_id,
    attestation_level: input.attestation_level,
    evidence_status: "pending",
  };

  return record;
}

/**
 * Verify that an evidence record is internally consistent.
 * Does NOT verify on-chain anchoring — use the backend's verify() for that.
 */
export function verifyEvidence(
  record: EvidenceRecord,
  originalRequest?: unknown,
  originalResponse?: unknown
): EvidenceVerification {
  const errors: string[] = [];

  // Check evidence ID format
  const evidenceIdFormat = /^evi_[a-z0-9]{8,}$/.test(record.evidence_id);
  if (!evidenceIdFormat) {
    errors.push(`Invalid evidence_id format: "${record.evidence_id}"`);
  }

  // Check required fields
  const requiredFields = [
    "evidence_id",
    "execution_id",
    "contract_id",
    "authority",
    "requesting_wallet",
    "requesting_org",
    "action",
    "outcome",
    "request_hash",
    "gateway_id",
    "attestation_level",
  ] as const;

  let requiredPresent = true;
  for (const field of requiredFields) {
    if (!record[field]) {
      errors.push(`Missing required field: "${field}"`);
      requiredPresent = false;
    }
  }

  // Verify request hash
  let requestHashValid = true;
  if (originalRequest !== undefined) {
    const expectedHash = sha256(canonicalJson(originalRequest));
    if (record.request_hash !== expectedHash) {
      requestHashValid = false;
      errors.push("Request hash does not match original request payload");
    }
  }

  // Verify response hash
  let responseHashValid = true;
  if (originalResponse !== undefined && record.response_hash) {
    const expectedHash = sha256(canonicalJson(originalResponse));
    if (record.response_hash !== expectedHash) {
      responseHashValid = false;
      errors.push("Response hash does not match original response payload");
    }
  }

  // Check timestamp ordering
  let timestampsOrdered = true;
  const ts = record.timestamps;
  if (ts.requested_at && ts.authorized_at) {
    if (new Date(ts.authorized_at) < new Date(ts.requested_at)) {
      timestampsOrdered = false;
      errors.push("authorized_at is before requested_at");
    }
  }
  if (ts.authorized_at && ts.approved_at) {
    if (new Date(ts.approved_at) < new Date(ts.authorized_at)) {
      timestampsOrdered = false;
      errors.push("approved_at is before authorized_at");
    }
  }
  if (ts.executed_at && ts.evidenced_at) {
    if (new Date(ts.evidenced_at) < new Date(ts.executed_at)) {
      timestampsOrdered = false;
      errors.push("evidenced_at is before executed_at");
    }
  }

  return {
    valid: errors.length === 0,
    checks: {
      request_hash_valid: requestHashValid,
      response_hash_valid: responseHashValid,
      timestamps_ordered: timestampsOrdered,
      required_fields_present: requiredPresent,
      evidence_id_format: evidenceIdFormat,
    },
    errors,
  };
}

/**
 * Compute the SHA-256 content hash of an entire evidence record.
 * This is the value that gets anchored on-chain.
 */
export function hashEvidence(record: EvidenceRecord): string {
  return sha256(canonicalJson(record));
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function sha256(input: string): string {
  return `sha256:${createHash("sha256").update(input).digest("hex")}`;
}

function canonicalJson(obj: unknown): string {
  if (obj === null || obj === undefined) return "null";
  if (typeof obj === "number") {
    if (Number.isNaN(obj)) return '"__NaN__"';
    if (obj === Infinity) return '"__Infinity__"';
    if (obj === -Infinity) return '"__-Infinity__"';
    if (Object.is(obj, -0)) return '"__-0__"';
    return JSON.stringify(obj);
  }
  if (typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) {
    return `[${obj.map(canonicalJson).join(",")}]`;
  }
  const sorted = Object.keys(obj as Record<string, unknown>).sort();
  const pairs = sorted.map(
    (key) =>
      `${JSON.stringify(key)}:${canonicalJson((obj as Record<string, unknown>)[key])}`
  );
  return `{${pairs.join(",")}}`;
}

function generateEvidenceId(): string {
  const bytes = randomBytes(12);
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "evi_";
  for (let i = 0; i < 12; i++) {
    result += chars.charAt(bytes[i] % chars.length);
  }
  return result;
}
