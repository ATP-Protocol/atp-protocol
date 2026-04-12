/**
 * @atp-protocol/gateway
 *
 * Reference ATP Gateway — governed execution middleware for MCP tools.
 *
 * @example
 * ```typescript
 * import { ATPGateway } from "@atp-protocol/gateway";
 *
 * const gateway = new ATPGateway({ gateway_id: "gw_prod_01" });
 *
 * // Register a contract
 * gateway.contracts.register("ctr_email", {
 *   version: "1.0.0",
 *   authority: "org.procurement.send-email",
 *   actions: ["send-email"],
 *   attestation: "full",
 * });
 *
 * // Bind a wallet to an org with authority
 * gateway.authority.bind("0xAgent", {
 *   org_id: "org_abc",
 *   role: "procurement_agent",
 *   authorities: ["org.procurement.send-email"],
 * });
 *
 * // Register a tool handler
 * gateway.registerTool("send-email", "ctr_email", async (params) => {
 *   // Your tool logic here
 *   return { status: 200, body: { sent: true } };
 * });
 *
 * // Execute a governed action
 * const result = await gateway.execute({
 *   contract_id: "ctr_email",
 *   action: "send-email",
 *   params: { to: "vendor@approved.com", subject: "PO-001" },
 *   wallet: "0xAgent",
 * });
 *
 * console.log(result.outcome);     // "outcome:success"
 * console.log(result.evidence_id); // "evi_abc123..."
 * ```
 */

export { ATPGateway } from "./gateway";
export type { ToolHandler, RegisteredTool } from "./gateway";

// Stores
export {
  ContractStore,
  AuthorityStore,
  CredentialStore,
  EvidenceStore,
  IdempotencyStore,
  ApprovalStore,
} from "./store";
export type { PendingApproval, ApprovalState } from "./store";

// Middleware
export { checkAuthority } from "./middleware/authority";
export type { AuthorityResult } from "./middleware/authority";
export { evaluatePolicy } from "./middleware/policy";
export type { PolicyResult } from "./middleware/policy";
export { resolveCredentials, buildInjection } from "./middleware/credentials";
export type { CredentialResult } from "./middleware/credentials";
export { captureEvidence } from "./middleware/evidence";
export type { EvidenceCaptureInput } from "./middleware/evidence";
export { anchorEvidence, retryPendingAnchors } from "./middleware/anchor";
export type { AnchorEvidenceInput } from "./middleware/anchor";

// DUAL Integration
export { MockDUALClient, RealDUALClient } from "./dual/client";
export type { IDUALClient } from "./dual/client";
export { DUALAuthorityResolver } from "./dual/authority";
export type {
  WalletVerification,
  DUALOrganization,
  DUALOrganizationMember,
  DUALOrganizationRole,
  DUALObject,
  AnchorResult,
  AttestationVerification,
  ActionResult,
  DUALNetworkConfig,
} from "./dual/types";

// Utilities
export { sha256, generateIdempotencyKey, canonicalJson, parseDuration } from "./util";

// Types
export type {
  ATPContract,
  ExecutionRequest,
  ExecutionResponse,
  ExecutionOutcome,
  EvidenceRecord,
  GatewayConfig,
  WalletBinding,
  StoredCredential,
} from "./types";
