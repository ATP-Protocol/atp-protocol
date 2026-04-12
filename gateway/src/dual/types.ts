/**
 * DUAL Network Types
 *
 * Type definitions for DUAL network integration (ATP Spec Section 14).
 */

export interface WalletVerification {
  wallet_address: string;
  is_valid: boolean;
  public_key?: string;
  network: "mainnet" | "testnet";
}

export interface DUALOrganization {
  id: string;
  name: string;
  fqdn: string;
  members: DUALOrganizationMember[];
  roles: DUALOrganizationRole[];
}

export interface DUALOrganizationMember {
  member_id: string;
  wallet_address: string;
  role: string;
  status: "active" | "pending" | "inactive";
  joined_at: string;
}

export interface DUALOrganizationRole {
  role_id: string;
  role_name: string;
  permissions: string[];
  description?: string;
}

export interface DUALObject {
  id: string;
  type: string;
  state?: string;
  owner: string;
  org_id: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  metadata?: Record<string, unknown>;
  provenance?: {
    execution_id?: string;
    evidence_id?: string;
    attestation_ref?: string;
    action?: string;
  };
}

export interface AnchorResult {
  attestation_ref: string;
  object_id: string;
  anchored_at: string;
  network: "dual-mainnet" | "dual-testnet";
  tx_hash?: string;
}

export interface AttestationVerification {
  attestation_ref: string;
  is_valid: boolean;
  object_id: string;
  verified_at: string;
  gateway_signature_valid?: boolean;
}

export interface ActionResult {
  action_id: string;
  status: "success" | "failure" | "pending";
  result?: unknown;
  error?: string;
}

/**
 * DUAL network configuration for gateway.
 */
export interface DUALNetworkConfig {
  enabled: boolean;
  endpoint: string;
  api_key?: string;
  network: "mainnet" | "testnet";
  anchor_evidence: boolean;
  verify_wallets: boolean;
  cache_ttl: number;  // seconds
}
