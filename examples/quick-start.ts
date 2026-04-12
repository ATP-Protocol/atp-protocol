/**
 * ATP Quick Start Example
 *
 * Demonstrates the core SDK features:
 * 1. Contract validation
 * 2. Policy evaluation
 * 3. Approval flow
 * 4. Governed execution
 */

import {
  validateContract,
  evaluatePolicy,
  requiresApproval,
  parseEscalationPath,
  ApprovalFlow,
  atpGovern,
} from "@atp-protocol/sdk";

// ---------------------------------------------------------------------------
// 1. Validate a contract
// ---------------------------------------------------------------------------

const contract = {
  version: "1.0.0",
  authority: "org.procurement.send-email",
  actions: ["send-email"],
  scope: {
    recipient_domain: ["@approved-vendors.com", "@internal.company.com"],
    max_attachments: 3,
    prohibited_content: ["payment instructions", "wire transfer"],
  },
  approval: {
    required: true,
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
  attestation: "full" as const,
};

const validation = validateContract(contract);
console.log("Contract valid:", validation.valid);
console.log("Warnings:", validation.warnings.length);

// ---------------------------------------------------------------------------
// 2. Evaluate policy against request params
// ---------------------------------------------------------------------------

const policyResult = evaluatePolicy(contract, {
  recipient_domain: "vendor@approved-vendors.com",
  max_attachments: 1,
});
console.log("\nPolicy permitted:", policyResult.permitted);
console.log("Constraints applied:", policyResult.constraints_applied.length);

// Try a violation
const violationResult = evaluatePolicy(contract, {
  recipient_domain: "hacker@evil.com",
});
console.log("\nViolation permitted:", violationResult.permitted);
console.log("Denial reason:", violationResult.denial_reason);

// ---------------------------------------------------------------------------
// 3. Check approval requirements
// ---------------------------------------------------------------------------

console.log("\nRequires approval:", requiresApproval(contract));
console.log("Escalation path:", parseEscalationPath(contract));

// ---------------------------------------------------------------------------
// 4. Run an approval flow
// ---------------------------------------------------------------------------

const flow = new ApprovalFlow(
  "ctr_procurement_001",
  "send-email",
  { recipient: "vendor@approved-vendors.com", subject: "PO-2026-001" },
  "0xAgentWallet"
);

console.log("\nApproval state:", flow.state); // REQUESTED

flow.transition("deliver");
console.log("After deliver:", flow.state); // PENDING_REVIEW

flow.transition("approve");
console.log("After approve:", flow.state); // APPROVED
console.log("Is approved:", flow.isApproved()); // true

const record = flow.toRecord("0xManagerWallet", "procurement_manager");
console.log("Approval record:", record.approval_id);

// ---------------------------------------------------------------------------
// 5. Govern an MCP tool (simulated)
// ---------------------------------------------------------------------------

async function sendEmailHandler(args: { to: string; subject: string; body: string }) {
  // This would be your actual MCP tool implementation
  console.log(`\nSending email to ${args.to}: ${args.subject}`);
  return { messageId: "msg_123", status: "sent" };
}

const governedSendEmail = atpGovern(
  {
    contract,
    gateway: "local", // Use "https://gateway.your-org.com" for production
    onDenied: async (reason) => {
      console.log("Action denied:", reason);
    },
  },
  sendEmailHandler
);

// Execute the governed tool
async function main() {
  const result = await governedSendEmail({
    to: "vendor@approved-vendors.com",
    subject: "PO-2026-001",
    body: "Please find attached the purchase order.",
  });

  console.log("Outcome:", result.outcome);
  console.log("Execution ID:", result.execution_id);
  if (result.result) {
    console.log("Result:", result.result);
  }
}

main().catch(console.error);
