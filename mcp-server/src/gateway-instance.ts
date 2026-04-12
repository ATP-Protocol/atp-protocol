/**
 * Singleton ATP gateway instance for the MCP server.
 * Persists state (contracts, bindings, credentials, evidence) across tool calls.
 */

import { ATPGateway } from "@atp-protocol/gateway";

let gatewayInstance: ATPGateway | null = null;

export function getGateway(): ATPGateway {
  if (!gatewayInstance) {
    gatewayInstance = new ATPGateway({
      gateway_id: "mcp_atp_gateway",
      conformance_level: "verified",
      dual_integration: false, // Enable via environment if needed
    });
  }
  return gatewayInstance;
}

export function resetGateway(): void {
  gatewayInstance = null;
}
