/**
 * In-Memory Store
 *
 * Reference implementation of gateway state stores.
 * Production gateways would use persistent storage.
 */

import type {
  ATPContract,
  WalletBinding,
  StoredCredential,
  EvidenceRecord,
  ExecutionResponse,
} from "../types";

// ---------------------------------------------------------------------------
// Contract Store
// ---------------------------------------------------------------------------

export class ContractStore {
  private contracts = new Map<string, ATPContract & { id: string; revoked: boolean }>();

  register(id: string, contract: ATPContract): void {
    this.contracts.set(id, { ...contract, id, revoked: false });
  }

  get(id: string): (ATPContract & { id: string; revoked: boolean }) | undefined {
    return this.contracts.get(id);
  }

  revoke(id: string): boolean {
    const contract = this.contracts.get(id);
    if (!contract) return false;
    contract.revoked = true;
    return true;
  }

  list(): Array<ATPContract & { id: string; revoked: boolean }> {
    return Array.from(this.contracts.values());
  }
}

// ---------------------------------------------------------------------------
// Authority Store
// ---------------------------------------------------------------------------

export class AuthorityStore {
  private bindings = new Map<string, WalletBinding>();

  bind(wallet: string, binding: Omit<WalletBinding, "wallet">): void {
    this.bindings.set(wallet, { wallet, ...binding });
  }

  getBinding(wallet: string): WalletBinding | undefined {
    return this.bindings.get(wallet);
  }

  hasAuthority(wallet: string, authority: string): boolean {
    const binding = this.bindings.get(wallet);
    if (!binding) return false;
    return binding.authorities.some((a) => {
      // Exact match or wildcard (org.domain.*)
      if (a === authority) return true;
      if (a.endsWith(".*")) {
        const prefix = a.slice(0, -1); // "org.procurement."
        return authority.startsWith(prefix);
      }
      return false;
    });
  }
}

// ---------------------------------------------------------------------------
// Credential Store
// ---------------------------------------------------------------------------

export class CredentialStore {
  private credentials = new Map<string, StoredCredential>();

  store(key: string, credential: StoredCredential): void {
    this.credentials.set(key, credential);
  }

  resolve(provider: string, org_id: string, requiredScope: string[]): StoredCredential | undefined {
    for (const cred of this.credentials.values()) {
      if (cred.provider === provider && cred.org_id === org_id) {
        // Check scope coverage
        const hasScope = requiredScope.every((s) => cred.scope.includes(s));
        if (!hasScope) continue;

        // Check expiry
        if (cred.expires_at && new Date(cred.expires_at).getTime() < Date.now()) {
          continue; // Expired
        }

        return cred;
      }
    }
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Evidence Store
// ---------------------------------------------------------------------------

export class EvidenceStore {
  private records = new Map<string, EvidenceRecord>();

  store(record: EvidenceRecord): void {
    this.records.set(record.evidence_id, record);
  }

  get(id: string): EvidenceRecord | undefined {
    return this.records.get(id);
  }

  getByExecution(executionId: string): EvidenceRecord | undefined {
    for (const record of this.records.values()) {
      if (record.execution_id === executionId) return record;
    }
    return undefined;
  }

  getByContract(contractId: string): EvidenceRecord[] {
    return Array.from(this.records.values()).filter((r) => r.contract_id === contractId);
  }

  list(): EvidenceRecord[] {
    return Array.from(this.records.values());
  }
}

// ---------------------------------------------------------------------------
// Idempotency Store
// ---------------------------------------------------------------------------

export class IdempotencyStore {
  private keys = new Map<string, ExecutionResponse>();

  check(key: string): ExecutionResponse | undefined {
    return this.keys.get(key);
  }

  record(key: string, response: ExecutionResponse): void {
    this.keys.set(key, response);
  }
}

// ---------------------------------------------------------------------------
// Approval Store
// ---------------------------------------------------------------------------

export type ApprovalState =
  | "REQUESTED"
  | "PENDING_REVIEW"
  | "APPROVED"
  | "DENIED"
  | "EXPIRED"
  | "ESCALATED"
  | "DENIED_TIMEOUT"
  | "REVOKED";

export interface PendingApproval {
  approval_id: string;
  contract_id: string;
  action: string;
  scope_params: Record<string, unknown>;
  requesting_wallet: string;
  approver_role: string;
  state: ApprovalState;
  created_at: string;
  decided_at?: string;
  decided_by?: string;
  nonce: string;
}

export class ApprovalStore {
  private approvals = new Map<string, PendingApproval>();

  create(approval: PendingApproval): void {
    this.approvals.set(approval.approval_id, approval);
  }

  get(id: string): PendingApproval | undefined {
    return this.approvals.get(id);
  }

  approve(id: string, approverWallet: string): boolean {
    const approval = this.approvals.get(id);
    if (!approval || approval.state !== "PENDING_REVIEW") return false;
    approval.state = "APPROVED";
    approval.decided_at = new Date().toISOString();
    approval.decided_by = approverWallet;
    return true;
  }

  deny(id: string, approverWallet: string): boolean {
    const approval = this.approvals.get(id);
    if (!approval || approval.state !== "PENDING_REVIEW") return false;
    approval.state = "DENIED";
    approval.decided_at = new Date().toISOString();
    approval.decided_by = approverWallet;
    return true;
  }

  revokeByContract(contractId: string): number {
    let count = 0;
    for (const approval of this.approvals.values()) {
      if (approval.contract_id === contractId && !isTerminal(approval.state)) {
        approval.state = "REVOKED";
        approval.decided_at = new Date().toISOString();
        count++;
      }
    }
    return count;
  }

  listPending(): PendingApproval[] {
    return Array.from(this.approvals.values()).filter((a) => a.state === "PENDING_REVIEW");
  }
}

function isTerminal(state: ApprovalState): boolean {
  return ["APPROVED", "DENIED", "DENIED_TIMEOUT", "REVOKED"].includes(state);
}
