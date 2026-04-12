/**
 * DUAL Network Integration Module
 *
 * Exports for DUAL client, authority resolution, and types.
 */

export { MockDUALClient, RealDUALClient } from "./client";
export type { IDUALClient } from "./client";
export { DUALAuthorityResolver } from "./authority";
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
} from "./types";
