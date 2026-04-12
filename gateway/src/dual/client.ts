/**
 * DUAL Client
 *
 * Wraps DUAL network API calls for wallet auth, organization binding, and evidence anchoring.
 * (ATP Spec Section 14)
 */

import type {
  WalletVerification,
  DUALOrganization,
  DUALObject,
  AnchorResult,
  AttestationVerification,
  ActionResult,
} from "./types";
import type { EvidenceRecord } from "../types";

export interface IDUALClient {
  // Wallet & Identity
  verifyWallet(walletAddress: string): Promise<WalletVerification>;
  getOrganization(orgId: string): Promise<DUALOrganization>;

  // Object & State
  createObject(data: {
    type: string;
    state?: string;
    owner: string;
    org_id: string;
    created_by: string;
    metadata?: Record<string, unknown>;
  }): Promise<{ object_id: string }>;
  getObject(objectId: string): Promise<DUALObject>;

  // Evidence Anchoring (Spec Section 14.5)
  anchorEvidence(evidence: EvidenceRecord): Promise<AnchorResult>;
  verifyAttestation(attestationRef: string): Promise<AttestationVerification>;

  // Action Execution
  executeAction(action: {
    action_id: string;
    template_id: string;
    params: Record<string, unknown>;
  }): Promise<ActionResult>;
}

/**
 * Real DUAL network client implementation.
 * Makes HTTP calls to the DUAL API endpoint.
 */
export class RealDUALClient implements IDUALClient {
  private endpoint: string;
  private apiKey?: string;
  private network: "mainnet" | "testnet";

  constructor(endpoint: string, network: "mainnet" | "testnet" = "testnet", apiKey?: string) {
    this.endpoint = endpoint.replace(/\/$/, ""); // Remove trailing slash
    this.network = network;
    this.apiKey = apiKey;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.endpoint}${path}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `DUAL API error (${response.status}): ${errorText}`
      );
    }

    return response.json() as Promise<T>;
  }

  async verifyWallet(walletAddress: string): Promise<WalletVerification> {
    return this.request(
      "GET",
      `/wallets/${walletAddress}`
    );
  }

  async getOrganization(orgId: string): Promise<DUALOrganization> {
    return this.request(
      "GET",
      `/organizations/${orgId}`
    );
  }

  async createObject(data: {
    type: string;
    state?: string;
    owner: string;
    org_id: string;
    created_by: string;
    metadata?: Record<string, unknown>;
  }): Promise<{ object_id: string }> {
    return this.request(
      "POST",
      "/objects",
      data
    );
  }

  async getObject(objectId: string): Promise<DUALObject> {
    return this.request(
      "GET",
      `/objects/${objectId}`
    );
  }

  async anchorEvidence(evidence: EvidenceRecord): Promise<AnchorResult> {
    // Create an attestation object on DUAL with the evidence record
    const result = await this.request<{ object_id: string }>(
      "POST",
      "/objects",
      {
        type: "attestation",
        state: "confirmed",
        owner: evidence.gateway_id,
        org_id: evidence.requesting_org,
        created_by: evidence.gateway_id,
        metadata: {
          evidence_id: evidence.evidence_id,
          execution_id: evidence.execution_id,
          contract_id: evidence.contract_id,
          evidence_hash: evidence.request_hash,
          outcome: evidence.outcome,
          timestamps: evidence.timestamps,
        },
      }
    );

    return {
      attestation_ref: `att_${result.object_id}`,
      object_id: result.object_id,
      anchored_at: new Date().toISOString(),
      network: this.network === "mainnet" ? "dual-mainnet" : "dual-testnet",
    };
  }

  async verifyAttestation(attestationRef: string): Promise<AttestationVerification> {
    // Extract object_id from attestation_ref (format: att_<object_id>)
    const objectId = attestationRef.replace(/^att_/, "");

    const obj = await this.getObject(objectId);
    const attRef = attestationRef;

    return {
      attestation_ref: attRef,
      is_valid: obj.type === "attestation" && obj.state === "confirmed",
      object_id: obj.id,
      verified_at: new Date().toISOString(),
      gateway_signature_valid: true, // In production, would verify signature
    };
  }

  async executeAction(action: {
    action_id: string;
    template_id: string;
    params: Record<string, unknown>;
  }): Promise<ActionResult> {
    return this.request(
      "POST",
      "/actions",
      action
    );
  }
}

/**
 * Mock DUAL client for testing and development.
 * Returns canned responses without network calls.
 */
export class MockDUALClient implements IDUALClient {
  private objects = new Map<string, DUALObject>();
  private walletIndex = new Set<string>();

  constructor() {
    // Pre-populate with known wallets
    this.walletIndex.add("0xAgent");
    this.walletIndex.add("0xAnalyst");
    this.walletIndex.add("0xApprover");
  }

  async verifyWallet(walletAddress: string): Promise<WalletVerification> {
    const isValid = this.walletIndex.has(walletAddress);
    return {
      wallet_address: walletAddress,
      is_valid: isValid,
      public_key: isValid ? `0x${walletAddress.slice(2).padStart(64, "0")}` : undefined,
      network: "testnet",
    };
  }

  async getOrganization(orgId: string): Promise<DUALOrganization> {
    return {
      id: orgId,
      name: `Organization ${orgId}`,
      fqdn: `${orgId}.dual.test`,
      members: [
        {
          member_id: "mem_1",
          wallet_address: "0xAgent",
          role: "procurement_agent",
          status: "active",
          joined_at: new Date().toISOString(),
        },
        {
          member_id: "mem_2",
          wallet_address: "0xAnalyst",
          role: "analyst",
          status: "active",
          joined_at: new Date().toISOString(),
        },
      ],
      roles: [
        {
          role_id: "rol_1",
          role_name: "admin",
          permissions: ["*"],
          description: "Administrator",
        },
        {
          role_id: "rol_2",
          role_name: "procurement_agent",
          permissions: ["org.procurement.*"],
          description: "Procurement agent",
        },
        {
          role_id: "rol_3",
          role_name: "analyst",
          permissions: ["org.analytics.*"],
          description: "Data analyst",
        },
      ],
    };
  }

  async createObject(data: {
    type: string;
    state?: string;
    owner: string;
    org_id: string;
    created_by: string;
    metadata?: Record<string, unknown>;
  }): Promise<{ object_id: string }> {
    const objectId = `obj_${Math.random().toString(36).slice(2, 10)}`;
    const obj: DUALObject = {
      id: objectId,
      type: data.type,
      state: data.state || "created",
      owner: data.owner,
      org_id: data.org_id,
      created_by: data.created_by,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      metadata: data.metadata,
    };
    this.objects.set(objectId, obj);
    return { object_id: objectId };
  }

  async getObject(objectId: string): Promise<DUALObject> {
    const obj = this.objects.get(objectId);
    if (!obj) {
      throw new Error(`Object ${objectId} not found`);
    }
    return obj;
  }

  async anchorEvidence(evidence: EvidenceRecord): Promise<AnchorResult> {
    const result = await this.createObject({
      type: "attestation",
      state: "confirmed",
      owner: evidence.gateway_id,
      org_id: evidence.requesting_org,
      created_by: evidence.gateway_id,
      metadata: {
        evidence_id: evidence.evidence_id,
        execution_id: evidence.execution_id,
        contract_id: evidence.contract_id,
        evidence_hash: evidence.request_hash,
        outcome: evidence.outcome,
      },
    });

    return {
      attestation_ref: `att_${result.object_id}`,
      object_id: result.object_id,
      anchored_at: new Date().toISOString(),
      network: "dual-testnet",
    };
  }

  async verifyAttestation(attestationRef: string): Promise<AttestationVerification> {
    const objectId = attestationRef.replace(/^att_/, "");
    const obj = this.objects.get(objectId);
    const attRef = attestationRef;

    return {
      attestation_ref: attRef,
      is_valid: obj?.type === "attestation" && obj?.state === "confirmed",
      object_id: objectId,
      verified_at: new Date().toISOString(),
      gateway_signature_valid: true,
    };
  }

  async executeAction(action: {
    action_id: string;
    template_id: string;
    params: Record<string, unknown>;
  }): Promise<ActionResult> {
    return {
      action_id: action.action_id,
      status: "success",
      result: { executed: true },
    };
  }
}
