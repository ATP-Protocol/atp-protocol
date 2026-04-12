/**
 * Authority Check Middleware
 *
 * Verifies wallet-org-role bindings and authority grants (Spec Section 5).
 */

import type { ATPContract } from "../types";
import type { AuthorityStore } from "../store";

export interface AuthorityResult {
  authorized: boolean;
  wallet: string;
  org_id?: string;
  role?: string;
  constraints_applied: string[];
  denial_reason?: string;
}

/**
 * Verify that a wallet has the authority declared in the contract.
 */
export function checkAuthority(
  wallet: string,
  contract: ATPContract & { id: string; revoked: boolean },
  authorityStore: AuthorityStore
): AuthorityResult {
  // 1. Contract validity
  if (contract.revoked) {
    return {
      authorized: false,
      wallet,
      denial_reason: "contract_revoked",
      constraints_applied: [],
    };
  }

  if (contract.expiry && new Date(contract.expiry).getTime() < Date.now()) {
    return {
      authorized: false,
      wallet,
      denial_reason: "contract_expired",
      constraints_applied: [],
    };
  }

  // 2. Wallet binding
  const binding = authorityStore.getBinding(wallet);
  if (!binding) {
    return {
      authorized: false,
      wallet,
      denial_reason: "wallet_not_bound",
      constraints_applied: [],
    };
  }

  // 3. Authority check
  if (!authorityStore.hasAuthority(wallet, contract.authority)) {
    return {
      authorized: false,
      wallet,
      org_id: binding.org_id,
      role: binding.role,
      denial_reason: "role_missing_authority",
      constraints_applied: [],
    };
  }

  // 4. Collect constraints
  const constraints: string[] = [];
  if (binding.constraints) {
    for (const [key, value] of Object.entries(binding.constraints)) {
      constraints.push(`${key}:${value}`);
    }
  }

  return {
    authorized: true,
    wallet,
    org_id: binding.org_id,
    role: binding.role,
    constraints_applied: constraints,
  };
}
