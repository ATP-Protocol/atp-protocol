/**
 * Credentials Module Tests
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  CredentialStore,
  resolveCredential,
  buildInjectionHeaders,
} from "../credentials";
import type { CredentialProvider, StoredCredentialEntry } from "../credentials";
import type { ATPContract, CredentialConfig } from "../types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeContract(
  credentialOverrides: Partial<CredentialConfig> = {}
): ATPContract {
  return {
    version: "1.0.0",
    authority: "org.test.agent",
    actions: ["send-email"],
    attestation: "full",
    credentials: {
      provider: "gmail-api",
      scope: ["send"],
      inject_as: "oauth_token",
      fail_closed: true,
      ...credentialOverrides,
    },
  };
}

function makeEntry(overrides: Partial<StoredCredentialEntry> = {}): StoredCredentialEntry {
  return {
    provider: "gmail-api",
    org_id: "org_test",
    scopes: ["send", "read"],
    type: "oauth_token",
    value: "ya29.test-access-token",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// CredentialStore
// ---------------------------------------------------------------------------

describe("CredentialStore", () => {
  let store: CredentialStore;

  beforeEach(() => {
    store = new CredentialStore();
  });

  it("resolves a registered credential", async () => {
    store.register(makeEntry());

    const result = await store.resolve("gmail-api", "org_test", ["send"]);
    expect(result).toBeTruthy();
    expect(result!.provider).toBe("gmail-api");
    expect(result!.value).toBe("ya29.test-access-token");
  });

  it("returns null for missing credential", async () => {
    const result = await store.resolve("stripe", "org_test", ["charge"]);
    expect(result).toBeNull();
  });

  it("returns null for wrong org", async () => {
    store.register(makeEntry({ org_id: "org_other" }));

    const result = await store.resolve("gmail-api", "org_test", ["send"]);
    expect(result).toBeNull();
  });

  it("returns null for insufficient scopes", async () => {
    store.register(makeEntry({ scopes: ["read"] }));

    const result = await store.resolve("gmail-api", "org_test", ["send"]);
    expect(result).toBeNull();
  });

  it("returns null for expired credentials", async () => {
    store.register(
      makeEntry({ expires_at: "2020-01-01T00:00:00Z" })
    );

    const result = await store.resolve("gmail-api", "org_test", ["send"]);
    expect(result).toBeNull();
  });

  it("resolves for contract with credentials", async () => {
    store.register(makeEntry());

    const result = await store.resolveForContract(
      makeContract(),
      "org_test"
    );

    expect(result.resolved).toBe(true);
    expect(result.provider).toBe("gmail-api");
    expect(result.injection_method).toBe("oauth_token");
    expect(result.injection_headers?.Authorization).toContain("Bearer ");
  });

  it("denies when fail_closed and credential missing", async () => {
    const result = await store.resolveForContract(
      makeContract({ fail_closed: true }),
      "org_test"
    );

    expect(result.resolved).toBe(false);
    expect(result.denial_reason).toContain("not found");
  });

  it("allows when fail_closed: false and credential missing", async () => {
    const result = await store.resolveForContract(
      makeContract({ fail_closed: false }),
      "org_test"
    );

    expect(result.resolved).toBe(true);
    expect(result.scope_used).toEqual([]);
  });

  it("resolves from pluggable provider", async () => {
    const vaultProvider: CredentialProvider = {
      name: "vault",
      resolve: async (provider, orgId, scopes) => {
        if (provider === "stripe") {
          return {
            provider: "stripe",
            org_id: orgId,
            scopes,
            type: "api_key",
            value: "sk_test_vault_resolved",
          };
        }
        return null;
      },
    };

    store.addProvider(vaultProvider);

    const result = await store.resolve("stripe", "org_test", ["charge"]);
    expect(result).toBeTruthy();
    expect(result!.value).toBe("sk_test_vault_resolved");
  });

  it("revokes credentials", () => {
    store.register(makeEntry());
    store.register(makeEntry({ scopes: ["admin"] }));

    const revoked = store.revoke("gmail-api", "org_test");
    expect(revoked).toBe(2);
  });

  it("lists inventory without exposing secrets", () => {
    store.register(makeEntry());
    store.register(makeEntry({ provider: "stripe", type: "api_key", value: "sk_secret" }));

    const inventory = store.inventory("org_test");
    expect(inventory).toHaveLength(2);
    // Should not contain actual values
    expect(inventory.find((e) => e.provider === "gmail-api")).toBeTruthy();
    expect(JSON.stringify(inventory)).not.toContain("ya29");
    expect(JSON.stringify(inventory)).not.toContain("sk_secret");
  });

  it("resolves for contract with no credentials required", async () => {
    const contract: ATPContract = {
      version: "1.0.0",
      authority: "org.test.agent",
      actions: ["read-data"],
      attestation: "none",
    };

    const result = await store.resolveForContract(contract, "org_test");
    expect(result.resolved).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// buildInjectionHeaders
// ---------------------------------------------------------------------------

describe("buildInjectionHeaders", () => {
  it("builds Bearer header for oauth_token", () => {
    const headers = buildInjectionHeaders("token123", "oauth_token");
    expect(headers.Authorization).toBe("Bearer token123");
  });

  it("builds Bearer header for bearer_token", () => {
    const headers = buildInjectionHeaders("tok", "bearer_token");
    expect(headers.Authorization).toBe("Bearer tok");
  });

  it("builds Basic auth header", () => {
    const headers = buildInjectionHeaders("user:pass", "basic_auth");
    expect(headers.Authorization).toMatch(/^Basic /);
  });

  it("builds API key header", () => {
    const headers = buildInjectionHeaders("key123", "api_key");
    expect(headers["X-API-Key"]).toBe("key123");
  });

  it("builds custom header", () => {
    const headers = buildInjectionHeaders("custom_val", "custom");
    expect(headers["X-Custom-Credential"]).toBe("custom_val");
  });
});
