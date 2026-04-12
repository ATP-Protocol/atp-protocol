/**
 * Credential Resolver
 *
 * Resolves credentials for ATP-governed tool executions.
 * Credentials are NEVER returned to agents — only injection headers are produced.
 *
 * Follows ATP Spec Section 8 — Credential Brokerage.
 */

import type {
  ATPContract,
  CredentialConfig,
  CredentialInjectionMethod,
} from "../types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A stored credential entry.
 * The `value` field contains the actual secret (token, key, password).
 */
export interface StoredCredentialEntry {
  /** Credential provider name (e.g., "gmail-api", "stripe", "github"). */
  provider: string;
  /** Organization scope — credentials are org-bound. */
  org_id: string;
  /** Scopes this credential grants. */
  scopes: string[];
  /** Credential type. */
  type: CredentialInjectionMethod;
  /** The actual credential value (secret). */
  value: string;
  /** When this credential expires (ISO timestamp). */
  expires_at?: string;
  /** When this credential was last refreshed. */
  refreshed_at?: string;
}

/**
 * Credential provider interface.
 * Implement this to create custom credential sources (e.g., vault, env vars).
 */
export interface CredentialProvider {
  /** Provider name. */
  readonly name: string;

  /**
   * Resolve a credential for the given provider and scopes.
   * Returns null if not found.
   */
  resolve(
    provider: string,
    orgId: string,
    scopes: string[]
  ): Promise<StoredCredentialEntry | null>;

  /**
   * Refresh a credential (e.g., OAuth token refresh).
   * Returns the refreshed entry or null if refresh is not supported.
   */
  refresh?(entry: StoredCredentialEntry): Promise<StoredCredentialEntry | null>;
}

/**
 * Result of credential resolution.
 */
export interface CredentialResolution {
  /** Whether a credential was successfully resolved. */
  resolved: boolean;
  /** Provider name. */
  provider?: string;
  /** Scopes that were resolved. */
  scope_used?: string[];
  /** Injection method to use. */
  injection_method?: CredentialInjectionMethod;
  /** Injection headers (safe to pass to downstream — contains the credential). */
  injection_headers?: Record<string, string>;
  /** Reason for failure. */
  denial_reason?: string;
}

// ---------------------------------------------------------------------------
// Credential Store
// ---------------------------------------------------------------------------

/**
 * In-process credential store with pluggable providers.
 *
 * @example
 * ```typescript
 * import { CredentialStore } from "@atp-protocol/sdk/credentials";
 *
 * const store = new CredentialStore();
 *
 * // Register credentials directly
 * store.register({
 *   provider: "gmail-api",
 *   org_id: "org_123",
 *   scopes: ["send", "read"],
 *   type: "oauth_token",
 *   value: "ya29.access-token-here",
 *   expires_at: "2026-04-13T00:00:00Z",
 * });
 *
 * // Or add a custom provider (e.g., HashiCorp Vault)
 * store.addProvider(myVaultProvider);
 *
 * // Resolve for a contract
 * const result = await store.resolveForContract(contract, "org_123");
 * if (result.resolved) {
 *   // result.injection_headers contains the Authorization header
 * }
 * ```
 */
export class CredentialStore {
  private entries: StoredCredentialEntry[] = [];
  private providers: CredentialProvider[] = [];

  /**
   * Register a credential directly.
   */
  register(entry: StoredCredentialEntry): void {
    // Remove any existing entry for the same provider/org/scope combination
    this.entries = this.entries.filter(
      (e) =>
        !(
          e.provider === entry.provider &&
          e.org_id === entry.org_id &&
          scopesMatch(e.scopes, entry.scopes)
        )
    );
    this.entries.push(entry);
  }

  /**
   * Add a credential provider for dynamic resolution.
   */
  addProvider(provider: CredentialProvider): void {
    this.providers.push(provider);
  }

  /**
   * Resolve a credential for a specific provider, org, and scope set.
   */
  async resolve(
    provider: string,
    orgId: string,
    scopes: string[]
  ): Promise<StoredCredentialEntry | null> {
    // 1. Check registered entries first
    const entry = this.entries.find(
      (e) =>
        e.provider === provider &&
        e.org_id === orgId &&
        scopes.every((s) => e.scopes.includes(s))
    );

    if (entry) {
      // Check expiry
      if (entry.expires_at && new Date(entry.expires_at) < new Date()) {
        // Try to refresh
        const refreshed = await this.tryRefresh(entry);
        if (refreshed) return refreshed;
        return null; // Expired and can't refresh
      }
      return entry;
    }

    // 2. Try providers
    for (const prov of this.providers) {
      const result = await prov.resolve(provider, orgId, scopes);
      if (result) {
        // Cache the resolved credential
        this.register(result);
        return result;
      }
    }

    return null;
  }

  /**
   * Resolve credentials for a contract.
   * Applies fail_closed semantics as per Spec Section 8.
   */
  async resolveForContract(
    contract: ATPContract,
    orgId: string
  ): Promise<CredentialResolution> {
    if (!contract.credentials?.provider) {
      // No credentials required
      return { resolved: true };
    }

    return resolveCredential(contract.credentials, orgId, this);
  }

  /**
   * Remove all credentials for a provider/org.
   */
  revoke(provider: string, orgId: string): number {
    const before = this.entries.length;
    this.entries = this.entries.filter(
      (e) => !(e.provider === provider && e.org_id === orgId)
    );
    return before - this.entries.length;
  }

  /**
   * List all registered providers and their scopes (secrets redacted).
   */
  inventory(orgId: string): Array<{
    provider: string;
    scopes: string[];
    type: CredentialInjectionMethod;
    expires_at?: string;
  }> {
    return this.entries
      .filter((e) => e.org_id === orgId)
      .map((e) => ({
        provider: e.provider,
        scopes: e.scopes,
        type: e.type,
        expires_at: e.expires_at,
      }));
  }

  private async tryRefresh(
    entry: StoredCredentialEntry
  ): Promise<StoredCredentialEntry | null> {
    for (const provider of this.providers) {
      if (provider.refresh) {
        // Only pass metadata to the provider, NOT the credential value
        const metadata = {
          provider: entry.provider,
          scopes: entry.scopes,
          type: entry.type,
          org_id: entry.org_id,
          expires_at: entry.expires_at,
        };
        // Reconstruct a credential entry with only metadata for the refresh call
        const metadataEntry: StoredCredentialEntry = {
          ...metadata,
          value: "", // Empty value — provider should not see the old secret
        };
        const refreshed = await provider.refresh(metadataEntry);
        if (refreshed) {
          this.register(refreshed);
          return refreshed;
        }
      }
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// Functional API
// ---------------------------------------------------------------------------

/**
 * Resolve a credential based on a contract's credential config.
 */
export async function resolveCredential(
  config: CredentialConfig,
  orgId: string,
  store: CredentialStore
): Promise<CredentialResolution> {
  const { provider, scope: requiredScope, inject_as, fail_closed } = config;

  if (!provider) {
    return { resolved: true };
  }

  const scopeNeeded = requiredScope ?? [];
  const entry = await store.resolve(provider, orgId, scopeNeeded);

  if (!entry) {
    if (fail_closed !== false) {
      return {
        resolved: false,
        provider,
        denial_reason: `Credential not found for provider "${provider}" with scope [${scopeNeeded.join(", ")}]`,
      };
    }
    // fail_closed: false — proceed without credential (dev mode only)
    return {
      resolved: true,
      provider,
      scope_used: [],
      injection_method: inject_as,
    };
  }

  const injectionMethod = inject_as ?? entry.type;
  const headers = buildInjectionHeaders(entry.value, injectionMethod);

  return {
    resolved: true,
    provider,
    scope_used: scopeNeeded,
    injection_method: injectionMethod,
    injection_headers: headers,
  };
}

/**
 * Build HTTP headers for credential injection.
 * This is the only place credential values are formatted for downstream use.
 */
export function buildInjectionHeaders(
  credentialValue: string,
  method: CredentialInjectionMethod
): Record<string, string> {
  switch (method) {
    case "oauth_token":
    case "bearer_token":
      return { Authorization: `Bearer ${credentialValue}` };
    case "basic_auth":
      return {
        Authorization: `Basic ${Buffer.from(credentialValue).toString("base64")}`,
      };
    case "api_key":
      return { "X-API-Key": credentialValue };
    case "custom":
      return { "X-Custom-Credential": credentialValue };
    default:
      return { Authorization: `Bearer ${credentialValue}` };
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function scopesMatch(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sorted = [...a].sort();
  const sortedB = [...b].sort();
  return sorted.every((s, i) => s === sortedB[i]);
}
