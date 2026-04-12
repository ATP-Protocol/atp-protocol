/**
 * Evidence Capture Middleware
 *
 * Captures complete evidence records for every governed execution (Spec Section 10).
 */

import { v4 as uuidv4 } from "uuid";
import type { ATPContract, ExecutionOutcome, EvidenceRecord } from "../types";
import type { EvidenceStore } from "../store";
import { sha256 } from "../util";

export interface EvidenceCaptureInput {
  execution_id: string;
  contract: ATPContract & { id: string };
  authority: string;
  requesting_wallet: string;
  requesting_org: string;
  action: string;
  scope_snapshot: Record<string, unknown>;
  approval_id?: string;
  credential_provider?: string;
  credential_scope_used?: string[];
  outcome: ExecutionOutcome;
  request_payload: unknown;
  response_payload?: unknown;
  timestamps: {
    requested_at: string;
    authorized_at?: string;
    approved_at?: string;
    executed_at?: string;
  };
  gateway_id: string;
}

/**
 * Capture an evidence record and store it.
 */
export function captureEvidence(
  input: EvidenceCaptureInput,
  evidenceStore: EvidenceStore
): EvidenceRecord {
  const evidence_id = `evi_${uuidv4().replace(/-/g, "").slice(0, 16)}`;
  const now = new Date().toISOString();

  const record: EvidenceRecord = {
    evidence_id,
    execution_id: input.execution_id,
    contract_id: input.contract.id,
    authority: input.authority,
    requesting_wallet: input.requesting_wallet,
    requesting_org: input.requesting_org,
    action: input.action,
    scope_snapshot: input.scope_snapshot,
    approval_id: input.approval_id,
    credential_provider: input.credential_provider,
    credential_scope_used: input.credential_scope_used,
    outcome: input.outcome,
    request_hash: sha256(JSON.stringify(input.request_payload)),
    response_hash: input.response_payload
      ? sha256(JSON.stringify(input.response_payload))
      : undefined,
    timestamps: {
      ...input.timestamps,
      evidenced_at: now,
    },
    gateway_id: input.gateway_id,
    attestation_level: input.contract.attestation,
    evidence_status: "confirmed", // In production, would be "pending" until DUAL anchoring succeeds
  };

  evidenceStore.store(record);
  return record;
}
