/**
 * ATP Gateway Singleton Instance
 *
 * Maintains a single gateway instance across all MCP tool calls.
 * This ensures state (contracts, authority bindings, credentials, evidence)
 * persists across the lifetime of the MCP server process.
 */

import { ATPGateway } from "@atp-protocol/gateway";

let gatewayInstance: ATPGateway | null = null;

/**
 * Get or create the singleton gateway instance
 */
export function getGateway(): ATPGateway {
  if (!gatewayInstance) {
    gatewayInstance = new ATPGateway({
      gateway_id: "mcp_atp_gateway",
      conformance_level: "verified",
      dual_integration: false, // Can be enabled via environment
    });
  }
  return gatewayInstance;
}

/**
 * Reset the gateway instance (primarily for testing)
 */
export function resetGateway(): void {
  gatewayInstance = null;
}
