/**
 * Credential Brokerage Middleware
 *
 * Resolves and injects credentials without exposing them to agents (Spec Section 8).
 */

import type { ATPContract, StoredCredential } from "../types";
import type { CredentialStore } from "../store";

export interface CredentialResult {
  resolved: boolean;
  provider?: string;
  scope_used?: string[];
  injection_method?: string;
  denial_reason?: string;
  credential?: StoredCredential; // Internal — never sent to agents
}

/**
 * Resolve credentials for a contract execution.
 * Returns the credential for gateway-internal injection.
 * The credential value MUST NOT be returned to the agent.
 */
export function resolveCredentials(
  contract: ATPContract,
  orgId: string,
  credentialStore: CredentialStore
): CredentialResult {
  if (!contract.credentials?.provider) {
    // No credentials required
    return { resolved: true };
  }

  const { provider, scope: requiredScope, inject_as, fail_closed } = contract.credentials;
  const scopeNeeded = requiredScope ?? [];

  // Resolve from credential store
  const credential = credentialStore.resolve(provider!, orgId, scopeNeeded);

  if (!credential) {
    if (fail_closed !== false) {
      return {
        resolved: false,
        provider,
        denial_reason: `Credential not found for provider "${provider}" with scope [${scopeNeeded.join(", ")}]`,
      };
    }
    // fail_closed: false — allow execution without credential (dev only)
    return {
      resolved: true,
      provider,
      scope_used: [],
      injection_method: inject_as,
    };
  }

  return {
    resolved: true,
    provider,
    scope_used: scopeNeeded,
    injection_method: inject_as,
    credential,
  };
}

/**
 * Build the injection headers/params for the downstream request.
 * This is what the gateway adds to the downstream tool call.
 */
export function buildInjection(
  credential: StoredCredential,
  method: string | undefined
): Record<string, string> {
  const headers: Record<string, string> = {};

  switch (method ?? credential.credential_type) {
    case "oauth_token":
    case "bearer_token":
      headers["Authorization"] = `Bearer ${credential.value}`;
      break;
    case "basic_auth":
      headers["Authorization"] = `Basic ${Buffer.from(credential.value).toString("base64")}`;
      break;
    case "api_key":
      headers["X-API-Key"] = credential.value;
      break;
    case "custom":
      // Custom injection — provider-specific
      headers["X-Custom-Credential"] = credential.value;
      break;
  }

  return headers;
}
