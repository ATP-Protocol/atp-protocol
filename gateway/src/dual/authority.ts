/**
 * DUAL Authority Resolution
 *
 * Resolves wallet authority from DUAL network instead of in-memory store.
 * (ATP Spec Section 14.1-14.2)
 */

import type { IDUALClient } from "./client";
import type { WalletBinding } from "../types";

interface CachedBinding {
  binding: WalletBinding;
  cached_at: number;
}

/**
 * Resolves authority from DUAL network with local caching.
 */
export class DUALAuthorityResolver {
  private client: IDUALClient;
  private cache = new Map<string, CachedBinding>();
  private cacheTTL: number; // milliseconds

  constructor(client: IDUALClient, cacheTTLSeconds: number = 60) {
    this.client = client;
    this.cacheTTL = cacheTTLSeconds * 1000;
  }

  /**
   * Resolve a wallet's binding from DUAL.
   * Returns cached result if within TTL.
   */
  async resolveWalletBinding(
    walletAddress: string,
    orgId: string
  ): Promise<WalletBinding | null> {
    // Check cache
    const cached = this.cache.get(walletAddress);
    if (cached && Date.now() - cached.cached_at < this.cacheTTL) {
      return cached.binding;
    }

    try {
      // Verify wallet exists on DUAL
      const walletVerification = await this.client.verifyWallet(walletAddress);
      if (!walletVerification.is_valid) {
        return null;
      }

      // Get organization and check membership
      const org = await this.client.getOrganization(orgId);

      // Find member
      const member = org.members.find((m) => m.wallet_address === walletAddress);
      if (!member || member.status !== "active") {
        return null;
      }

      // Find role
      const role = org.roles.find((r) => r.role_name === member.role);
      if (!role) {
        return null;
      }

      // Build binding
      const binding: WalletBinding = {
        wallet: walletAddress,
        org_id: orgId,
        role: member.role,
        authorities: role.permissions,
      };

      // Cache it
      this.cache.set(walletAddress, {
        binding,
        cached_at: Date.now(),
      });

      return binding;
    } catch (error) {
      // Network error or validation failure
      console.error(`Failed to resolve wallet ${walletAddress} on DUAL:`, error);
      return null;
    }
  }

  /**
   * Clear a wallet's cache entry (e.g., after role changes).
   */
  clearCache(walletAddress: string): void {
    this.cache.delete(walletAddress);
  }

  /**
   * Clear all cached bindings.
   */
  clearAllCache(): void {
    this.cache.clear();
  }
}
