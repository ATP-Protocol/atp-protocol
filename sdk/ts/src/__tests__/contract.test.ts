import { describe, it, expect } from "vitest";
import {
  validateContract,
  isContractExpired,
  requiresApproval,
  parseEscalationPath,
} from "../contract";

// ---------------------------------------------------------------------------
// Valid contract fixture
// ---------------------------------------------------------------------------

const VALID_CONTRACT = {
  version: "1.0.0",
  authority: "org.procurement.send-email",
  template: "tpl_purchase_order_comms",
  actions: ["send-email"],
  scope: {
    recipient_domain: ["@approved-vendors.com", "@internal.company.com"],
    max_attachments: 3,
    prohibited_content: ["payment instructions", "wire transfer"],
  },
  approval: {
    required: true,
    required_above: null,
    approver_role: "procurement_manager",
    timeout: "PT4H",
    escalation_path: "department_head,cfo",
  },
  credentials: {
    provider: "gmail-api",
    scope: ["send"],
    inject_as: "oauth_token" as const,
    fail_closed: true,
  },
  output: {
    object_type: "procurement_communication",
    initial_state: "sent",
    schema_ref: "schemas/procurement-email-v1.json",
  },
  attestation: "full" as const,
  revocable: true,
  expiry: "2030-07-11T00:00:00Z",
  idempotency: "gateway-enforced" as const,
};

// ---------------------------------------------------------------------------
// validateContract
// ---------------------------------------------------------------------------

describe("validateContract", () => {
  it("accepts a valid contract", () => {
    const result = validateContract(VALID_CONTRACT);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("accepts a minimal contract (required fields only)", () => {
    const result = validateContract({
      version: "1.0.0",
      authority: "org.finance.approve-payment",
      actions: ["approve-payment"],
      attestation: "full",
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects null input", () => {
    const result = validateContract(null);
    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe("INVALID_TYPE");
  });

  it("rejects non-object input", () => {
    const result = validateContract("not a contract");
    expect(result.valid).toBe(false);
  });

  // Required fields
  it("rejects missing version", () => {
    const { version, ...rest } = VALID_CONTRACT;
    const result = validateContract(rest);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "version")).toBe(true);
  });

  it("rejects missing authority", () => {
    const { authority, ...rest } = VALID_CONTRACT;
    const result = validateContract(rest);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "authority")).toBe(true);
  });

  it("rejects missing actions", () => {
    const { actions, ...rest } = VALID_CONTRACT;
    const result = validateContract(rest);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "actions")).toBe(true);
  });

  it("rejects missing attestation", () => {
    const { attestation, ...rest } = VALID_CONTRACT;
    const result = validateContract(rest);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "attestation")).toBe(true);
  });

  // Format validation
  it("rejects invalid version format", () => {
    const result = validateContract({ ...VALID_CONTRACT, version: "v1" });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "INVALID_VERSION")).toBe(true);
  });

  it("rejects invalid authority format", () => {
    const result = validateContract({ ...VALID_CONTRACT, authority: "bad-authority" });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "INVALID_AUTHORITY")).toBe(true);
  });

  it("rejects empty actions array", () => {
    const result = validateContract({ ...VALID_CONTRACT, actions: [] });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "EMPTY_ACTIONS")).toBe(true);
  });

  it("rejects invalid attestation level", () => {
    const result = validateContract({ ...VALID_CONTRACT, attestation: "maximum" });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "INVALID_ATTESTATION")).toBe(true);
  });

  it("rejects invalid idempotency model", () => {
    const result = validateContract({ ...VALID_CONTRACT, idempotency: "yolo" });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "INVALID_IDEMPOTENCY")).toBe(true);
  });

  // Warnings
  it("warns on attestation: none", () => {
    const result = validateContract({ ...VALID_CONTRACT, attestation: "none" });
    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.code === "DEV_ONLY_ATTESTATION")).toBe(true);
  });

  it("warns on fail_closed: false", () => {
    const result = validateContract({
      ...VALID_CONTRACT,
      credentials: { ...VALID_CONTRACT.credentials, fail_closed: false },
    });
    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.code === "DEV_ONLY_FAIL_OPEN")).toBe(true);
  });

  it("warns on past expiry", () => {
    const result = validateContract({ ...VALID_CONTRACT, expiry: "2020-01-01T00:00:00Z" });
    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.code === "EXPIRED_CONTRACT")).toBe(true);
  });

  // Unsafe idempotency requires ack
  it("rejects unsafe idempotency without ack", () => {
    const result = validateContract({
      ...VALID_CONTRACT,
      idempotency: "unsafe",
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "MISSING_IDEMPOTENCY_ACK")).toBe(true);
  });

  it("accepts unsafe idempotency with ack", () => {
    const result = validateContract({
      ...VALID_CONTRACT,
      idempotency: "unsafe",
      scope: { ...VALID_CONTRACT.scope, idempotency_ack: true },
    });
    expect(result.valid).toBe(true);
  });

  // Delegation validation
  it("rejects delegation depth > 5", () => {
    const result = validateContract({
      ...VALID_CONTRACT,
      delegation: { allow_sub_delegation: true, max_depth: 10 },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "INVALID_DELEGATION_DEPTH")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isContractExpired
// ---------------------------------------------------------------------------

describe("isContractExpired", () => {
  it("returns false for unexpired contract", () => {
    expect(isContractExpired(VALID_CONTRACT)).toBe(false);
  });

  it("returns true for expired contract", () => {
    expect(isContractExpired({ ...VALID_CONTRACT, expiry: "2020-01-01T00:00:00Z" })).toBe(true);
  });

  it("returns false for contract with no expiry", () => {
    const { expiry, ...rest } = VALID_CONTRACT;
    expect(isContractExpired(rest as any)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// requiresApproval
// ---------------------------------------------------------------------------

describe("requiresApproval", () => {
  it("returns true when approval is required with no threshold", () => {
    expect(requiresApproval(VALID_CONTRACT)).toBe(true);
  });

  it("returns false when approval is not required", () => {
    const contract = { ...VALID_CONTRACT, approval: { required: false } };
    expect(requiresApproval(contract)).toBe(false);
  });

  it("returns true when amount exceeds threshold", () => {
    const contract = { ...VALID_CONTRACT, approval: { required: true, required_above: 1000 } };
    expect(requiresApproval(contract, 5000)).toBe(true);
  });

  it("returns false when amount is below threshold", () => {
    const contract = { ...VALID_CONTRACT, approval: { required: true, required_above: 1000 } };
    expect(requiresApproval(contract, 500)).toBe(false);
  });

  it("returns false when no approval config", () => {
    const { approval, ...rest } = VALID_CONTRACT;
    expect(requiresApproval(rest as any)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// parseEscalationPath
// ---------------------------------------------------------------------------

describe("parseEscalationPath", () => {
  it("parses comma-separated roles", () => {
    expect(parseEscalationPath(VALID_CONTRACT)).toEqual(["department_head", "cfo"]);
  });

  it("returns empty array when no escalation path", () => {
    const contract = { ...VALID_CONTRACT, approval: { required: true } };
    expect(parseEscalationPath(contract)).toEqual([]);
  });

  it("trims whitespace", () => {
    const contract = {
      ...VALID_CONTRACT,
      approval: { ...VALID_CONTRACT.approval, escalation_path: " admin , cto , ceo " },
    };
    expect(parseEscalationPath(contract)).toEqual(["admin", "cto", "ceo"]);
  });
});
