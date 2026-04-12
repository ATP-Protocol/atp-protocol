import { describe, it, expect } from "vitest";
import { ApprovalFlow, ApprovalError, canTransition, validTriggers } from "../approval";

describe("ApprovalFlow", () => {
  const createFlow = () =>
    new ApprovalFlow("ctr_test", "send-email", { recipient: "a@b.com" }, "0xWallet123");

  // Happy path
  it("starts in REQUESTED state", () => {
    const flow = createFlow();
    expect(flow.state).toBe("REQUESTED");
  });

  it("transitions through happy path: REQUESTED → PENDING_REVIEW → APPROVED", () => {
    const flow = createFlow();
    flow.transition("deliver");
    expect(flow.state).toBe("PENDING_REVIEW");
    flow.transition("approve");
    expect(flow.state).toBe("APPROVED");
    expect(flow.isApproved()).toBe(true);
    expect(flow.isTerminal()).toBe(true);
  });

  // Denial path
  it("transitions to DENIED on explicit denial", () => {
    const flow = createFlow();
    flow.transition("deliver");
    flow.transition("deny");
    expect(flow.state).toBe("DENIED");
    expect(flow.isDenied()).toBe(true);
    expect(flow.isTerminal()).toBe(true);
  });

  // Timeout → escalation path
  it("handles timeout and escalation", () => {
    const flow = createFlow();
    flow.transition("deliver");
    flow.transition("timeout");
    expect(flow.state).toBe("EXPIRED");

    flow.transition("escalate");
    expect(flow.state).toBe("ESCALATED");
    expect(flow.escalationDepth).toBe(1);

    flow.transition("deliver");
    expect(flow.state).toBe("PENDING_REVIEW");

    flow.transition("approve");
    expect(flow.state).toBe("APPROVED");
  });

  // Timeout → no escalation
  it("transitions to DENIED_TIMEOUT when no escalation available", () => {
    const flow = createFlow();
    flow.transition("deliver");
    flow.transition("timeout");
    flow.transition("exhaust_escalation");
    expect(flow.state).toBe("DENIED_TIMEOUT");
    expect(flow.isDenied()).toBe(true);
    expect(flow.isTerminal()).toBe(true);
  });

  // Revocation
  it("can be revoked from REQUESTED", () => {
    const flow = createFlow();
    flow.transition("revoke");
    expect(flow.state).toBe("REVOKED");
    expect(flow.isDenied()).toBe(true);
  });

  it("can be revoked from PENDING_REVIEW", () => {
    const flow = createFlow();
    flow.transition("deliver");
    flow.transition("revoke");
    expect(flow.state).toBe("REVOKED");
  });

  it("can be revoked from EXPIRED", () => {
    const flow = createFlow();
    flow.transition("deliver");
    flow.transition("timeout");
    flow.transition("revoke");
    expect(flow.state).toBe("REVOKED");
  });

  it("can be revoked from ESCALATED", () => {
    const flow = createFlow();
    flow.transition("deliver");
    flow.transition("timeout");
    flow.transition("escalate");
    flow.transition("revoke");
    expect(flow.state).toBe("REVOKED");
  });

  // Invalid transitions
  it("throws on invalid transition", () => {
    const flow = createFlow();
    expect(() => flow.transition("approve")).toThrow(ApprovalError);
  });

  it("throws on transition from terminal state", () => {
    const flow = createFlow();
    flow.transition("deliver");
    flow.transition("approve");
    expect(() => flow.transition("deny")).toThrow(ApprovalError);
  });

  // History
  it("records transition history", () => {
    const flow = createFlow();
    flow.transition("deliver");
    flow.transition("approve");
    expect(flow.history).toHaveLength(3); // initial submit + deliver + approve
    expect(flow.history[1].from).toBe("REQUESTED");
    expect(flow.history[1].to).toBe("PENDING_REVIEW");
    expect(flow.history[2].from).toBe("PENDING_REVIEW");
    expect(flow.history[2].to).toBe("APPROVED");
  });

  // Multiple escalations
  it("tracks escalation depth", () => {
    const flow = createFlow();
    flow.transition("deliver");
    flow.transition("timeout");
    flow.transition("escalate"); // depth 1
    flow.transition("deliver");
    flow.transition("timeout");
    flow.transition("escalate"); // depth 2
    expect(flow.escalationDepth).toBe(2);
  });

  // toRequest and toRecord
  it("produces a valid approval request", () => {
    const flow = createFlow();
    const request = flow.toRequest();
    expect(request.contract_id).toBe("ctr_test");
    expect(request.action).toBe("send-email");
    expect(request.requesting_wallet).toBe("0xWallet123");
    expect(request.nonce).toBeTruthy();
  });

  it("produces a valid approval record", () => {
    const flow = createFlow();
    flow.transition("deliver");
    flow.transition("approve");
    const record = flow.toRecord("0xApprover", "procurement_manager");
    expect(record.decision).toBe("approved");
    expect(record.approver_wallet).toBe("0xApprover");
    expect(record.approver_role).toBe("procurement_manager");
    expect(record.escalation_depth).toBe(0);
  });
});

describe("canTransition", () => {
  it("returns true for valid transitions", () => {
    expect(canTransition("REQUESTED", "deliver")).toBe(true);
    expect(canTransition("PENDING_REVIEW", "approve")).toBe(true);
    expect(canTransition("PENDING_REVIEW", "deny")).toBe(true);
    expect(canTransition("PENDING_REVIEW", "timeout")).toBe(true);
    expect(canTransition("EXPIRED", "escalate")).toBe(true);
    expect(canTransition("EXPIRED", "exhaust_escalation")).toBe(true);
  });

  it("returns false for invalid transitions", () => {
    expect(canTransition("REQUESTED", "approve")).toBe(false);
    expect(canTransition("PENDING_REVIEW", "escalate")).toBe(false);
    expect(canTransition("APPROVED", "deny")).toBe(false);
    expect(canTransition("DENIED", "approve")).toBe(false);
  });

  it("returns false for terminal states", () => {
    expect(canTransition("APPROVED", "deliver")).toBe(false);
    expect(canTransition("DENIED", "deliver")).toBe(false);
    expect(canTransition("DENIED_TIMEOUT", "deliver")).toBe(false);
    expect(canTransition("REVOKED", "deliver")).toBe(false);
  });
});

describe("validTriggers", () => {
  it("returns correct triggers for each state", () => {
    expect(validTriggers("REQUESTED")).toEqual(expect.arrayContaining(["deliver", "revoke"]));
    expect(validTriggers("PENDING_REVIEW")).toEqual(
      expect.arrayContaining(["approve", "deny", "timeout", "revoke"])
    );
    expect(validTriggers("EXPIRED")).toEqual(
      expect.arrayContaining(["escalate", "exhaust_escalation", "revoke"])
    );
    expect(validTriggers("ESCALATED")).toEqual(expect.arrayContaining(["deliver", "revoke"]));
  });

  it("returns empty for terminal states", () => {
    expect(validTriggers("APPROVED")).toEqual([]);
    expect(validTriggers("DENIED")).toEqual([]);
    expect(validTriggers("DENIED_TIMEOUT")).toEqual([]);
    expect(validTriggers("REVOKED")).toEqual([]);
  });
});

// Edge case security tests
describe("ApprovalFlow — edge cases & security", () => {
  const createFlow = () =>
    new ApprovalFlow("ctr_test", "send-email", { recipient: "a@b.com" }, "0xWallet123");

  it("rejects concurrent approval attempts (second approval after first)", () => {
    const flow = createFlow();
    flow.transition("deliver");
    flow.transition("approve");
    expect(() => flow.transition("approve")).toThrow();
  });

  it("rejects approval after revocation attempt sequence", () => {
    const flow = createFlow();
    flow.transition("deliver");
    flow.transition("revoke");
    expect(() => flow.transition("approve")).toThrow();
    expect(flow.state).toBe("REVOKED");
  });

  it("enforces escalation depth exhaustion", () => {
    const flow = createFlow();
    // Escalate twice, then exhaust
    flow.transition("deliver");
    flow.transition("timeout");
    flow.transition("escalate"); // depth = 1, state = ESCALATED
    expect(flow.escalationDepth).toBe(1);
    expect(flow.state).toBe("ESCALATED");

    flow.transition("deliver"); // back to PENDING_REVIEW
    flow.transition("timeout"); // back to EXPIRED
    flow.transition("escalate"); // depth = 2, state = ESCALATED
    expect(flow.escalationDepth).toBe(2);

    flow.transition("deliver");
    flow.transition("timeout");
    flow.transition("exhaust_escalation"); // Deny
    expect(flow.isDenied()).toBe(true);
    expect(flow.state).toBe("DENIED_TIMEOUT");
  });

  it("preserves history accurately across all transitions", () => {
    const flow = createFlow();
    const initialHistoryLength = flow.history.length; // Initial submit
    flow.transition("deliver");
    flow.transition("approve");
    expect(flow.history).toHaveLength(initialHistoryLength + 2);
    expect(flow.history[flow.history.length - 1].trigger).toBe("approve");
    expect(flow.history[flow.history.length - 1].to).toBe("APPROVED");
  });

  it("maintains escalation depth independent of history length", () => {
    const flow = createFlow();
    flow.transition("deliver");
    flow.transition("timeout");
    flow.transition("escalate");
    const depthAfterEscalate = flow.escalationDepth;
    expect(depthAfterEscalate).toBe(1);

    flow.transition("deliver");
    flow.transition("approve");
    expect(flow.escalationDepth).toBe(1); // Should not increase
  });

  it("rejects transitions with invalid state in VALID_TRANSITIONS map", () => {
    const flow = createFlow();
    // Manually set to an impossible state to test robustness
    (flow as any)._state = "IMPOSSIBLE_STATE";
    expect(() => flow.transition("approve")).toThrow(ApprovalError);
  });
});
