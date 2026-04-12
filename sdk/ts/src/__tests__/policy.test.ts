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
