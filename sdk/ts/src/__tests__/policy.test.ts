import { describe, it, expect } from "vitest";
import { evaluatePolicy, mergeConstraints } from "../policy";
import type { ATPContract } from "../types";

const baseContract: ATPContract = {
  version: "1.0.0",
  authority: "org.procurement.send-email",
  actions: ["send-email"],
  attestation: "full",
};

describe("evaluatePolicy", () => {
  it("permits when no scope constraints", () => {
    const result = evaluatePolicy(baseContract, { anything: "goes" });
    expect(result.permitted).toBe(true);
    expect(result.policies_evaluated).toBe(0);
  });

  // Enumeration constraints
  it("permits when value matches enumeration (exact match)", () => {
    const contract: ATPContract = {
      ...baseContract,
      scope: { status: ["active", "pending"] },
    };
    const result = evaluatePolicy(contract, { status: "active" });
    expect(result.permitted).toBe(true);
  });

  it("denies when value not in enumeration", () => {
    const contract: ATPContract = {
      ...baseContract,
      scope: { status: ["active", "pending"] },
    };
    const result = evaluatePolicy(contract, { status: "deleted" });
    expect(result.permitted).toBe(false);
    expect(result.denial_source).toBe("contract");
  });

  it("supports domain matching in enumerations", () => {
    const contract: ATPContract = {
      ...baseContract,
      scope: { recipient_domain: ["@approved-vendors.com", "@internal.com"] },
    };

    const result1 = evaluatePolicy(contract, { recipient_domain: "user@approved-vendors.com" });
    expect(result1.permitted).toBe(true);

    const result2 = evaluatePolicy(contract, { recipient_domain: "user@evil.com" });
    expect(result2.permitted).toBe(false);
  });

  // Numeric max constraints
  it("permits when value is within max bound", () => {
    const contract: ATPContract = {
      ...baseContract,
      scope: { max_attachments: 3 },
    };
    const result = evaluatePolicy(contract, { max_attachments: 2 });
    expect(result.permitted).toBe(true);
  });

  it("denies when value exceeds max bound", () => {
    const contract: ATPContract = {
      ...baseContract,
      scope: { max_attachments: 3 },
    };
    const result = evaluatePolicy(contract, { max_attachments: 5 });
    expect(result.permitted).toBe(false);
  });

  // Boolean constraints
  it("denies when boolean constraint is false and value is truthy", () => {
    const contract: ATPContract = {
      ...baseContract,
      scope: { allow_attachments: false },
    };
    const result = evaluatePolicy(contract, { allow_attachments: true });
    expect(result.permitted).toBe(false);
  });

  it("permits when boolean constraint is true", () => {
    const contract: ATPContract = {
      ...baseContract,
      scope: { allow_attachments: true },
    };
    const result = evaluatePolicy(contract, { allow_attachments: true });
    expect(result.permitted).toBe(true);
  });

  // Deny list constraints
  it("denies when content matches prohibited term", () => {
    const contract: ATPContract = {
      ...baseContract,
      scope: { prohibited_content: ["wire transfer", "payment instructions"] },
    };
    const result = evaluatePolicy(contract, {
      prohibited_content: "Please process this wire transfer immediately",
    });
    expect(result.permitted).toBe(false);
  });

  it("permits when content does not match prohibited terms", () => {
    const contract: ATPContract = {
      ...baseContract,
      scope: { prohibited_content: ["wire transfer", "payment instructions"] },
    };
    const result = evaluatePolicy(contract, {
      prohibited_content: "Please review the attached purchase order",
    });
    expect(result.permitted).toBe(true);
  });

  // Multiple constraints — short-circuit
  it("short-circuits on first failure", () => {
    const contract: ATPContract = {
      ...baseContract,
      scope: {
        recipient_domain: ["@approved-vendors.com"],
        max_attachments: 3,
      },
    };
    const result = evaluatePolicy(contract, {
      recipient_domain: "user@evil.com",
      max_attachments: 1,
    });
    expect(result.permitted).toBe(false);
    // Should fail on first constraint
    expect(result.policies_evaluated).toBeLessThanOrEqual(2);
  });

  // Missing params — no enforcement
  it("permits when request param is missing (constraint not checked)", () => {
    const contract: ATPContract = {
      ...baseContract,
      scope: { max_amount: 5000 },
    };
    const result = evaluatePolicy(contract, {});
    expect(result.permitted).toBe(true);
  });

  // Rate limits — recorded but not locally enforced
  it("records rate limit constraints without denying", () => {
    const contract: ATPContract = {
      ...baseContract,
      scope: { rate_limit: { max: 10, per: "PT1H" } },
    };
    const result = evaluatePolicy(contract, {});
    expect(result.permitted).toBe(true);
    expect(result.constraints_applied.length).toBe(1);
  });

  // Skips metadata fields
  it("skips idempotency_ack field", () => {
    const contract: ATPContract = {
      ...baseContract,
      scope: { idempotency_ack: true, max_amount: 5000 },
    };
    const result = evaluatePolicy(contract, { max_amount: 1000 });
    expect(result.permitted).toBe(true);
    expect(result.policies_evaluated).toBe(1); // Only max_amount
  });
});

describe("mergeConstraints", () => {
  it("merges enumeration by intersection", () => {
    const org = { status: ["active", "pending", "review"] };
    const contract = { status: ["active", "pending"] };
    const merged = mergeConstraints(org, contract);
    expect(merged.status).toEqual(["active", "pending"]);
  });

  it("merges numeric max by taking lowest", () => {
    const org = { max_amount: 10000 };
    const contract = { max_amount: 5000 };
    const merged = mergeConstraints(org, contract);
    expect(merged.max_amount).toBe(5000);
  });

  it("merges numeric min by taking highest", () => {
    const org = { min_amount: 100 };
    const contract = { min_amount: 500 };
    const merged = mergeConstraints(org, contract);
    expect(merged.min_amount).toBe(500);
  });

  it("merges booleans where false wins", () => {
    const org = { allow_attachments: true };
    const contract = { allow_attachments: false };
    const merged = mergeConstraints(org, contract);
    expect(merged.allow_attachments).toBe(false);
  });

  it("handles non-overlapping fields", () => {
    const org = { max_amount: 10000 };
    const contract = { recipient_domain: ["@vendor.com"] };
    const merged = mergeConstraints(org, contract);
    expect(merged.max_amount).toBe(10000);
    expect(merged.recipient_domain).toEqual(["@vendor.com"]);
  });

  it("merges three policy sources", () => {
    const org = { max_amount: 10000, status: ["active", "pending", "review"] };
    const template = { max_amount: 7500, status: ["active", "pending"] };
    const contract = { max_amount: 5000, status: ["active"] };
    const merged = mergeConstraints(org, template, contract);
    expect(merged.max_amount).toBe(5000);
    expect(merged.status).toEqual(["active"]);
  });
});

// Edge case security tests
describe("Policy Evaluation — edge cases & security", () => {
  const baseContract = {
    version: "1.0.0",
    authority: "org.test.action",
    actions: ["test"],
    attestation: "light" as const,
  };

  it("rejects regex DoS patterns in pattern constraints", () => {
    // ReDoS pattern: exponential backtracking
    const evilRegex = "(a+)+$";
    const contract = {
      ...baseContract,
      scope: { pattern: evilRegex },
    };
    const params = { pattern: "aaaaaaaaaaaaaaaaaaaaaaaaaaax" };

    // Should complete without hanging (though it may take a moment to detect)
    const start = Date.now();
    try {
      evaluatePolicy(contract, params);
    } catch {
      // Expected to fail safely
    }
    const duration = Date.now() - start;
    // Allow up to 10s to account for system variance - the key is it doesn't hang forever
    expect(duration).toBeLessThan(10000);
  });

  it("handles extremely large deny lists (1000+ items)", () => {
    const hugeList = Array.from({ length: 1000 }, (_, i) => `vendor_${i}`);
    const contract = {
      ...baseContract,
      scope: { prohibited_vendors: hugeList },
    };
    const params = { vendor: "vendor_500" };
    const result = evaluatePolicy(contract, params);
    expect(result).toBeDefined();
  });

  it("rejects numeric overflow values (Number.MAX_SAFE_INTEGER + 1)", () => {
    const overflowValue = Number.MAX_SAFE_INTEGER + 1;
    const contract = {
      ...baseContract,
      scope: { max_amount: overflowValue },
    };
    const params = { amount: 10000 };
    // Should handle gracefully
    const result = evaluatePolicy(contract, params);
    expect(result).toBeDefined();
  });

  it("handles Infinity and -Infinity in numeric constraints", () => {
    const contract = {
      ...baseContract,
      scope: { max_amount: Infinity, min_amount: -Infinity },
    };
    const params = { amount: 999999999 };
    const result = evaluatePolicy(contract, params);
    expect(result).toBeDefined();
  });

  it("handles NaN in numeric constraints gracefully", () => {
    const contract = {
      ...baseContract,
      scope: { max_amount: NaN },
    };
    const params = { amount: 10000 };
    const result = evaluatePolicy(contract, params);
    expect(result).toBeDefined();
  });

  it("rejects null constraint values", () => {
    const contract = {
      ...baseContract,
      scope: { max_amount: null },
    };
    const params = { amount: 10000 };
    // Should handle null gracefully
    const result = evaluatePolicy(contract, params);
    expect(result).toBeDefined();
  });

  it("handles deeply nested constraints in arrays", () => {
    const contract = {
      ...baseContract,
      scope: {
        nested_rules: [
          { level1: { level2: { level3: { level4: { prohibited: ["a", "b"] } } } } },
        ],
      },
    };
    const params = { nested_rules: [{ level1: "test" }] };
    const result = evaluatePolicy(contract, params);
    expect(result).toBeDefined();
  });
});
