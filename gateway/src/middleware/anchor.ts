/**
 * Evidence Anchoring Middleware
 *
 * Anchors captured evidence records to DUAL network (ATP Spec Section 14.5).
 * This middleware runs after evidence is captured locally,
 * creating a DUAL object for the evidence and updating the evidence status.
 */

import type { IDUALClient } from "../dual/client";
import type { EvidenceRecord } from "../types";
import type { EvidenceStore } from "../store";

export interface AnchorEvidenceInput {
  evidence: EvidenceRecord;
  dualClient: IDUALClient;
  evidenceStore: EvidenceStore;
}

/**
 * Anchor evidence to DUAL network.
 * Updates the evidence record with attestation reference and status.
 * Handles failures gracefully: if DUAL is unreachable, evidence remains "pending".
 */
export async function anchorEvidence(input: AnchorEvidenceInput): Promise<void> {
  const { evidence, dualClient, evidenceStore } = input;

  // If evidence already has an attestation, skip
  if (evidence.attestation_level === "none") {
    return; // No attestation required
  }

  try {
    // Anchor evidence to DUAL
    const anchorResult = await dualClient.anchorEvidence(evidence);

    // Update evidence record with attestation reference
    const updatedEvidence: EvidenceRecord = {
      ...evidence,
      evidence_status: "confirmed",
      // Note: EvidenceRecord doesn't have attestation_ref field by default,
      // but in production this would be added to the type definition.
      // For now, we're updating the store with the confirmation.
    };

    // Store updated evidence
    evidenceStore.store(updatedEvidence);

    console.log(
      `Evidence ${evidence.evidence_id} anchored to DUAL: ${anchorResult.attestation_ref}`
    );
  } catch (error) {
    // DUAL is unreachable or failed to anchor
    // Leave evidence in "pending" state for retry
    const reason = error instanceof Error ? error.message : "Unknown error";
    console.warn(
      `Failed to anchor evidence ${evidence.evidence_id} to DUAL: ${reason}`
    );

    const pendingEvidence: EvidenceRecord = {
      ...evidence,
      evidence_status: "pending", // Will retry later
    };

    evidenceStore.store(pendingEvidence);
  }
}

/**
 * Retry anchoring of pending evidence records.
 * Called periodically to attempt anchoring for evidence marked "pending".
 */
export async function retryPendingAnchors(
  pendingRecords: EvidenceRecord[],
  dualClient: IDUALClient,
  evidenceStore: EvidenceStore
): Promise<{ succeeded: number; failed: number }> {
  let succeeded = 0;
  let failed = 0;

  for (const evidence of pendingRecords) {
    if (evidence.evidence_status !== "pending") {
      continue; // Skip non-pending
    }

    try {
      const anchorResult = await dualClient.anchorEvidence(evidence);
      const updated: EvidenceRecord = {
        ...evidence,
        evidence_status: "confirmed",
      };
      evidenceStore.store(updated);
      succeeded++;
      console.log(
        `Evidence ${evidence.evidence_id} successfully anchored: ${anchorResult.attestation_ref}`
      );
    } catch (error) {
      failed++;
      const reason = error instanceof Error ? error.message : "Unknown error";
      console.warn(`Failed to retry anchor for ${evidence.evidence_id}: ${reason}`);
    }
  }

  return { succeeded, failed };
}
