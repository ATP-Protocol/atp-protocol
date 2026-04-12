import { describe, it, expect, beforeEach } from "vitest";
import { ATPGateway } from "../gateway";
import type { ATPContract, ExecutionRequest } from "../types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const EMAIL_CONTRACT: ATPContract = {
  version: "1.0.0",
  authority: "org.procurement.send-email",
  actions: ["send-email"],
  scope: {
    recipient_domain: ["@approved-vendors.com"],
    max_attachments: 3,
    prohibited_content: ["wire transfer"],
  },
  credentials: {
    provider: "gmail-api",
    scope: ["send"],
    inject_as: "oauth_token",
    fail_closed: true,
  },
  attestation: "full",
  idempotency: "gateway-enforced",
};

const READ_CONTRACT: ATPContract = {
  version: "1.0.0",
  authority: "org.analytics.read-data",
  actions: ["query"],
  attestation: "light",
};

function setupGateway(): ATPGateway {
  const gw = new ATPGateway({ gateway_id: "gw_test" });

  // Register contracts
  gw.contracts.register("ctr_email", EMAIL_CONTRACT);
  gw.contracts.register("ctr_read", READ_CONTRACT);

  // Bind wallets
  gw.authority.bind("0xAgent", {
    org_id: "org_procurement",
    role: "procurement_agent",
    authorities: ["org.procurement.send-email"],
  });
  gw.authority.bind("0xAnalyst", {
    org_id: "org_analytics",
    role: "analyst",
    authorities: ["org.analytics.*"],
  });

  // Store credentials
  gw.credentials.store("gmail_procurement", {
    provider: "gmail-api",
    credential_type: "oauth_token",
    scope: ["send", "read"],
    value: "ya29.test-token-12345",
    org_id: "org_procurement",
  });

  // Register tool handlers
  gw.registerTool("send-email", "ctr_email", async (params) => {
    return { status: 200, body: { messageId: "msg_123", sent: true } };
  });
  gw.registerTool("query", "ctr_read", async (params) => {
    return { status: 200, body: { rows: [{ id: 1, value: "test" }] } };
  });

  return gw;
}

// ---------------------------------------------------------------------------
// Full pipeline tests
// ---------------------------------------------------------------------------

describe("ATPGateway — full pipeline", () => {
  let gw: ATPGateway;

  beforeEach(() => {
    gw = setupGateway();
  });

  it("executes a governed action successfully", async () => {
    const result = await gw.execute({
      contract_id: "ctr_email",
      action: "send-email",
      params: { recipient_domain: "vendor@approved-vendors.com" },
      wallet: "0xAgent",
    });

    expect(result.outcome).toBe("outcome:success");
    expect(result.execution_id).toMatch(/^exe_/);
    expect(result.evidence_id).toMatch(/^evi_/);
    expect(result.result).toEqual({ messageId: "msg_123", sent: true });
  });

  it("captures evidence for successful execution", async () => {
    const result = await gw.execute({
      contract_id: "ctr_email",
      action: "send-email",
      params: { recipient_domain: "vendor@approved-vendors.com" },
      wallet: "0xAgent",
    });

    const evidence = gw.evidence.get(result.evidence_id!);
    expect(evidence).toBeDefined();
    expect(evidence!.outcome).toBe("outcome:success");
    expect(evidence!.authority).toBe("org.procurement.send-email");
    expect(evidence!.requesting_wallet).toBe("0xAgent");
    expect(evidence!.requesting_org).toBe("org_procurement");
    expect(evidence!.gateway_id).toBe("gw_test");
    expect(evidence!.attestation_level).toBe("full");
  });

  it("works with a minimal read-only contract", async () => {
    const result = await gw.execute({
      contract_id: "ctr_read",
      action: "query",
      params: { table: "sales_summary" },
      wallet: "0xAnalyst",
    });

    expect(result.outcome).toBe("outcome:success");
    expect(result.result).toEqual({ rows: [{ id: 1, value: "test" }] });
  });
});

// ---------------------------------------------------------------------------
// Authority denial tests
// ---------------------------------------------------------------------------

describe("ATPGateway — authority", () => {
  let gw: ATPGateway;
  beforeEach(() => { gw = setupGateway(); });

  it("denies unbound wallet", async () => {
    const result = await gw.execute({
      contract_id: "ctr_email",
      action: "send-email",
      params: {},
      wallet: "0xUnknown",
    });
    expect(result.outcome).toBe("outcome:denied");
    expect(result.denied_stage).toBe("authority");
    expect(result.denied_reason).toContain("wallet_not_bound");
  });

  it("denies wallet without required authority", async () => {
    gw.authority.bind("0xWrongRole", {
      org_id: "org_procurement",
      role: "viewer",
      authorities: ["org.procurement.view-orders"],
    });

    const result = await gw.execute({
      contract_id: "ctr_email",
      action: "send-email",
      params: {},
      wallet: "0xWrongRole",
    });
    expect(result.outcome).toBe("outcome:denied");
    expect(result.denied_reason).toContain("role_missing_authority");
  });

  it("denies unknown contract", async () => {
    const result = await gw.execute({
      contract_id: "ctr_nonexistent",
      action: "send-email",
      params: {},
      wallet: "0xAgent",
    });
    expect(result.outcome).toBe("outcome:denied");
    expect(result.denied_reason).toContain("not found");
  });

  it("denies action not in contract", async () => {
    const result = await gw.execute({
      contract_id: "ctr_email",
      action: "delete-email",
      params: {},
      wallet: "0xAgent",
    });
    expect(result.outcome).toBe("outcome:denied");
    expect(result.denied_reason).toContain("not permitted by contract");
  });

  it("denies revoked contract", async () => {
    gw.contracts.revoke("ctr_email");
    const result = await gw.execute({
      contract_id: "ctr_email",
      action: "send-email",
      params: {},
      wallet: "0xAgent",
    });
    expect(result.outcome).toBe("outcome:denied");
    expect(result.denied_reason).toContain("contract_revoked");
  });
});

// ---------------------------------------------------------------------------
// Policy denial tests
// ---------------------------------------------------------------------------

describe("ATPGateway — policy", () => {
  let gw: ATPGateway;
  beforeEach(() => { gw = setupGateway(); });

  it("denies when recipient not in allowed domain", async () => {
    const result = await gw.execute({
      contract_id: "ctr_email",
      action: "send-email",
      params: { recipient_domain: "hacker@evil.com" },
      wallet: "0xAgent",
    });
    expect(result.outcome).toBe("outcome:denied");
    expect(result.denied_stage).toBe("policy");
  });

  it("denies when max exceeded", async () => {
    const result = await gw.execute({
      contract_id: "ctr_email",
      action: "send-email",
      params: { max_attachments: 10 },
      wallet: "0xAgent",
    });
    expect(result.outcome).toBe("outcome:denied");
    expect(result.denied_stage).toBe("policy");
  });

  it("denies prohibited content", async () => {
    const result = await gw.execute({
      contract_id: "ctr_email",
      action: "send-email",
      params: { prohibited_content: "Please process this wire transfer" },
      wallet: "0xAgent",
    });
    expect(result.outcome).toBe("outcome:denied");
    expect(result.denied_stage).toBe("policy");
  });
});

// ---------------------------------------------------------------------------
// Credential denial tests
// ---------------------------------------------------------------------------

describe("ATPGateway — credentials", () => {
  let gw: ATPGateway;
  beforeEach(() => { gw = setupGateway(); });

  it("denies when credential not found (fail_closed)", async () => {
    // Register a contract requiring a credential we don't have
    gw.contracts.register("ctr_stripe", {
      version: "1.0.0",
      authority: "org.procurement.send-email",
      actions: ["charge"],
      credentials: {
        provider: "stripe-api",
        scope: ["charges:write"],
        inject_as: "bearer_token",
        fail_closed: true,
      },
      attestation: "full",
    });
    gw.registerTool("charge", "ctr_stripe", async () => ({ status: 200, body: {} }));

    const result = await gw.execute({
      contract_id: "ctr_stripe",
      action: "charge",
      params: {},
      wallet: "0xAgent",
    });
    expect(result.outcome).toBe("outcome:denied");
    expect(result.denied_stage).toBe("credential");
  });
});

// ---------------------------------------------------------------------------
// Idempotency tests
// ---------------------------------------------------------------------------

describe("ATPGateway — idempotency", () => {
  let gw: ATPGateway;
  beforeEach(() => { gw = setupGateway(); });

  it("returns cached result for duplicate idempotency key", async () => {
    const request: ExecutionRequest = {
      contract_id: "ctr_email",
      action: "send-email",
      params: { recipient_domain: "vendor@approved-vendors.com" },
      wallet: "0xAgent",
      idempotency_key: "idk_test_duplicate",
    };

    const result1 = await gw.execute(request);
    const result2 = await gw.execute(request);

    expect(result1.execution_id).toBe(result2.execution_id);
    expect(result1.outcome).toBe("outcome:success");
    expect(result2.outcome).toBe("outcome:success");
  });
});

// ---------------------------------------------------------------------------
// Execution failure tests
// ---------------------------------------------------------------------------

describe("ATPGateway — execution", () => {
  let gw: ATPGateway;
  beforeEach(() => { gw = setupGateway(); });

  it("returns failure when handler throws", async () => {
    gw.registerTool("send-email", "ctr_email", async () => {
      throw new Error("SMTP connection refused");
    });

    const result = await gw.execute({
      contract_id: "ctr_email",
      action: "send-email",
      params: {},
      wallet: "0xAgent",
    });
    expect(result.outcome).toBe("outcome:failure");
  });

  it("classifies 4xx as failure", async () => {
    gw.registerTool("send-email", "ctr_email", async () => {
      return { status: 400, body: { error: "Bad request" } };
    });

    const result = await gw.execute({
      contract_id: "ctr_email",
      action: "send-email",
      params: {},
      wallet: "0xAgent",
    });
    expect(result.outcome).toBe("outcome:failure");
  });

  it("classifies 202 as unknown", async () => {
    gw.registerTool("send-email", "ctr_email", async () => {
      return { status: 202, body: { message: "Accepted" } };
    });

    const result = await gw.execute({
      contract_id: "ctr_email",
      action: "send-email",
      params: {},
      wallet: "0xAgent",
    });
    expect(result.outcome).toBe("outcome:unknown");
  });
});

// ---------------------------------------------------------------------------
// Approval tests
// ---------------------------------------------------------------------------

describe("ATPGateway — approval", () => {
  it("requires approval when configured", async () => {
    const gw = setupGateway();
    gw.contracts.register("ctr_approval", {
      ...EMAIL_CONTRACT,
      approval: {
        required: true,
        approver_role: "procurement_manager",
        timeout: "PT4H",
      },
    });
    gw.registerTool("send-email", "ctr_approval", async () => ({ status: 200, body: {} }));

    const result = await gw.execute({
      contract_id: "ctr_approval",
      action: "send-email",
      params: {},
      wallet: "0xAgent",
    });

    expect(result.outcome).toBe("outcome:denied");
    expect(result.denied_stage).toBe("approval");
    expect(result.denied_reason).toContain("Approval required");

    // Verify a pending approval was created
    const pending = gw.approvals.listPending();
    expect(pending.length).toBe(1);
    expect(pending[0].approver_role).toBe("procurement_manager");
  });

  it("executes after approval is granted", async () => {
    const gw = setupGateway();
    gw.contracts.register("ctr_approval", {
      ...EMAIL_CONTRACT,
      approval: {
        required: true,
        approver_role: "manager",
        timeout: "PT4H",
      },
    });
    gw.registerTool("send-email", "ctr_approval", async () => ({
      status: 200,
      body: { sent: true },
    }));

    // First call — gets approval ID
    const denied = await gw.execute({
      contract_id: "ctr_approval",
      action: "send-email",
      params: {},
      wallet: "0xAgent",
    });
    const approvalId = gw.approvals.listPending()[0].approval_id;

    // Approve it
    gw.approvals.approve(approvalId, "0xManager");

    // Execute with approval
    const result = await gw.executeApproved(
      {
        contract_id: "ctr_approval",
        action: "send-email",
        params: {},
        wallet: "0xAgent",
      },
      approvalId,
      "0xManager"
    );

    expect(result.outcome).toBe("outcome:success");
    expect(result.approval_id).toBe(approvalId);
  });
});

// ---------------------------------------------------------------------------
// Evidence query tests
// ---------------------------------------------------------------------------

describe("ATPGateway — evidence", () => {
  it("records evidence for denials", async () => {
    const gw = setupGateway();
    await gw.execute({
      contract_id: "ctr_email",
      action: "send-email",
      params: { recipient_domain: "hacker@evil.com" },
      wallet: "0xAgent",
    });

    const records = gw.evidence.getByContract("ctr_email");
    expect(records.length).toBe(1);
    expect(records[0].outcome).toBe("outcome:denied");
  });

  it("returns gateway metadata", () => {
    const gw = setupGateway();
    const metadata = gw.getMetadata();
    expect(metadata.gateway_id).toBe("gw_test");
    expect(metadata.atp_version).toBe("1.0.0");
    expect(metadata.conformance_level).toBe("verified");
  });
});
