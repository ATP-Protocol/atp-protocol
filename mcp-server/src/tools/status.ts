/**
 * ATP Gateway Status Tools
 *
 * Tools for querying gateway metadata, health, and configuration.
 */

import { z } from "zod";
import { getGateway } from "../gateway-instance";

/**
 * Input schema for atp_gateway_status
 */
export const GatewayStatusInput = z.object({});

export type GatewayStatusInput = z.infer<typeof GatewayStatusInput>;

/**
 * Get gateway metadata and health status.
 *
 * This tool returns information about the ATP gateway instance:
 * - Gateway ID and ATP version
 * - Conformance level (aware, compatible, verified, attested)
 * - Number of registered contracts and tools
 * - DUAL integration status
 * - Uptime and basic health metrics
 *
 * Use this when: verifying the gateway is running, checking capabilities,
 * or displaying gateway info to users.
 */
export async function gatewayStatusTool(input: GatewayStatusInput): Promise<object> {
  const gateway = getGateway();

  const contracts = gateway.contracts.list();
  const pendingApprovals = gateway.approvals.listPending();
  const evidenceRecords = gateway.evidence.list();

  const metadata = gateway.getMetadata();

  return {
    gateway_id: metadata.gateway_id,
    atp_version: metadata.atp_version,
    conformance_level: metadata.conformance_level,
    dual_integration: metadata.dual_integration,
    dual_network: metadata.dual_network,
    dual_anchor_enabled: metadata.dual_anchor_enabled,
    dual_wallet_verify: metadata.dual_wallet_verify,
    contracts: {
      total: contracts.length,
      registered: contracts.filter((c) => !c.revoked).length,
      revoked: contracts.filter((c) => c.revoked).length,
    },
    approvals: {
      pending: pendingApprovals.length,
    },
    evidence: {
      total_records: evidenceRecords.length,
      success_count: evidenceRecords.filter((e) => e.outcome === "outcome:success").length,
      denied_count: evidenceRecords.filter((e) => e.outcome === "outcome:denied").length,
      failure_count: evidenceRecords.filter((e) => e.outcome === "outcome:failure").length,
    },
    status: "operational",
    queried_at: new Date().toISOString(),
  };
}
