import { describe, it, expect } from "vitest";
import { atpGovern, createGovernedContext } from "../governance";
import type { ATPContract } from "../types";

const validContract: ATPContract = {
  version: "1.0.0",
  authority: "org.procurement.send-email",
  actions: ["send-email"],
  attestation: "full",
  scope: {
    recipient_domain: ["@approved-vendors.com"],
    max_attachments: 3,
  },
};

const expiredContract: ATPContract = {
  ...validContract,
  expiry: "2020-01-01T00:00:00Z",
};

describe("atpGovern", () => {
  const mockHandler = async (args: { message: string }) => ({
    sent: true,
    message: args.message,
  });

  it("executes handler and returns success on valid contract", async () => {
    const governed = atpGovern(
      { contract: validContract, gateway: "local" },
      mockHandler
    );
    const result = await governed({ message: "Hello" });
    expect(result.outcome).toBe("outcome:success");
    expect(result.result).toEqual({ sent: true, message: "Hello" });
    expect(result.execution_id).toMatch(/^exe_/);
  });

  it("denies execution on expired contract", async () => {
    const governed = atpGovern(
      { contract: expiredContract, gateway: "local" },
      mockHandler
    );
    const result = await governed({ message: "Hello" });
    expect(result.outcome).toBe("outcome:denied");
    expect(result.denied_reason).toContain("expired");
    expect(result.denied_stage).toBe("policy");
  });

  it("denies execution on policy violation", async () => {
    const governed = atpGovern(
      { contract: validContract, gateway: "local" },
      mockHandler
    );
    const result = await governed({
      message: "Hello",
      recipient_domain: "user@evil.com",
    } as any);
    expect(result.outcome).toBe("outcome:denied");
    expect(result.denied_stage).toBe("policy");
  });

  it("returns failure when handler throws", async () => {
    const failingHandler = async () => {
      throw new Error("SMTP connection refused");
    };
    const governed = atpGovern(
      { contract: validContract, gateway: "local" },
      failingHandler
    );
    const result = await governed({} as any);
    expect(result.outcome).toBe("outcome:failure");
    expect(result.denied_reason).toContain("SMTP connection refused");
  });

  it("calls onDenied callback on policy violation", async () => {
    let deniedReason = "";
    const governed = atpGovern(
      {
        contract: expiredContract,
        gateway: "local",
        onDenied: async (reason) => {
          deniedReason = reason;
        },
      },
      mockHandler
    );
    await governed({ message: "Hello" });
    expect(deniedReason).toContain("expired");
  });

  it("denies on invalid contract", async () => {
    const badContract = { version: "bad" } as ATPContract;
    const governed = atpGovern(
      { contract: badContract, gateway: "local" },
      mockHandler
    );
    const result = await governed({ message: "Hello" });
    expect(result.outcome).toBe("outcome:denied");
    expect(result.denied_reason).toContain("validation failed");
  });

  it("throws on string contract path (loader not implemented)", async () => {
    const governed = atpGovern(
      { contract: "contracts/test.json", gateway: "local" },
      mockHandler
    );
    const result = await governed({ message: "Hello" });
    expect(result.outcome).toBe("outcome:failure");
    expect(result.denied_reason).toContain("contract loader");
  });
});

describe("createGovernedContext", () => {
  it("creates a context with validation", async () => {
    const ctx = await createGovernedContext({
      contract: validContract,
      gateway: "local",
    });
    const validation = ctx.validate();
    expect(validation.valid).toBe(true);
  });

  it("detects expired contracts", async () => {
    const ctx = await createGovernedContext({
      contract: expiredContract,
      gateway: "local",
    });
    expect(ctx.isExpired()).toBe(true);
  });

  it("evaluates policy locally", async () => {
    const ctx = await createGovernedContext({
      contract: validContract,
      gateway: "local",
    });
    const result = ctx.evaluatePolicy({ recipient_domain: "user@approved-vendors.com" });
    expect(result.permitted).toBe(true);
  });

  it("checks approval requirements", async () => {
    const contractWithApproval: ATPContract = {
      ...validContract,
      approval: { required: true, required_above: 1000 },
    };
    const ctx = await createGovernedContext({
      contract: contractWithApproval,
      gateway: "local",
    });
    expect(ctx.requiresApproval(5000)).toBe(true);
    expect(ctx.requiresApproval(500)).toBe(false);
  });
});
