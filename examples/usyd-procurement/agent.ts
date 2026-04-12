#!/usr/bin/env node

/**
 * USyd Procurement Agent — ATP-Governed Example
 *
 * Demonstrates a governed procurement workflow with 5 mock finance tools.
 * Runs 4 demo scenarios showing permit/deny/escalation patterns.
 *
 * Run: npx tsx examples/usyd-procurement/agent.ts
 */

import {
  validateContract,
  evaluatePolicy,
  CredentialStore,
  buildEvidence,
  FileEvidenceBackend,
  GovernedTool,
} from "@atp-protocol/sdk";
import type { ATPContract, EvidenceRecord } from "@atp-protocol/sdk";

// ============================================================================
// CONTRACTS
// ============================================================================

const budgetQueryContract: ATPContract = {
  version: "1.0.0",
  authority: "usyd.finance.budget-query",
  actions: ["query_budget"],
  attestation: "light",
  scope: { action: "read" },
};

const supplierValidationContract: ATPContract = {
  version: "1.0.0",
  authority: "usyd.finance.supplier-check",
  actions: ["validate_supplier"],
  attestation: "light",
  scope: { action: "read" },
};

const draftPoContract: ATPContract = {
  version: "1.0.0",
  authority: "usyd.finance.draft-po",
  actions: ["draft_po"],
  attestation: "light",
  scope: { max_amount: 50000 },
  approval: {
    required: true,
    authority: "usyd.finance.po-approval",
    threshold_amount: 5000,
  },
};

const submitApprovalContract: ATPContract = {
  version: "1.0.0",
  authority: "usyd.finance.submit-approval",
  actions: ["submit_approval"],
  attestation: "full",
  approval: { required: true, authority: "usyd.finance.approval-gateway" },
};

const correspondenceContract: ATPContract = {
  version: "1.0.0",
  authority: "usyd.finance.correspondence",
  actions: ["send_correspondence"],
  attestation: "full",
  approval: { required: true, authority: "usyd.staff-comms" },
};

// ============================================================================
// MOCK TOOLS
// ============================================================================

const mockTools = {
  QueryBudgetTool: {
    name: "query_budget",
    description: "Look up remaining budget for a cost centre",
    invoke: async (input: {
      cost_centre: string;
    }): Promise<string> => {
      const budgets: Record<string, number> = {
        FN420301: 85000,
        FN420302: 150000,
        FN430410: 45000,
      };
      const remaining = budgets[input.cost_centre] ?? 0;
      return JSON.stringify({
        cost_centre: input.cost_centre,
        remaining_budget: remaining,
        currency: "AUD",
        as_of: new Date().toISOString(),
      });
    },
  },

  ValidateSupplierTool: {
    name: "validate_supplier",
    description: "Check if supplier is on preferred supplier list",
    invoke: async (input: {
      supplier_name: string;
    }): Promise<string> => {
      const preferred = [
        "Office Direct",
        "LabTech Solutions",
        "Staples Australia",
      ];
      const isPreferred = preferred.includes(input.supplier_name);
      return JSON.stringify({
        supplier: input.supplier_name,
        is_preferred: isPreferred,
        status: isPreferred ? "approved" : "not_on_list",
      });
    },
  },

  DraftPOTool: {
    name: "draft_po",
    description: "Create a draft purchase order",
    invoke: async (input: {
      supplier: string;
      amount: number;
      description: string;
      cost_centre: string;
    }): Promise<string> => {
      const poId = `PO${Math.floor(Date.now() / 1000)
        .toString()
        .slice(-8)}`;
      return JSON.stringify({
        po_id: poId,
        supplier: input.supplier,
        amount: input.amount,
        description: input.description,
        cost_centre: input.cost_centre,
        status: "draft",
        created_at: new Date().toISOString(),
      });
    },
  },

  SubmitApprovalTool: {
    name: "submit_approval",
    description: "Submit PO to approval workflow",
    invoke: async (input: {
      po_id: string;
    }): Promise<string> => {
      return JSON.stringify({
        po_id: input.po_id,
        submission_status: "pending_review",
        submitted_at: new Date().toISOString(),
        next_approver: "Finance Director",
      });
    },
  },

  SendCorrespondenceTool: {
    name: "send_correspondence",
    description: "Send email to supplier on behalf of staff",
    invoke: async (input: {
      supplier_email: string;
      subject: string;
      body: string;
    }): Promise<string> => {
      return JSON.stringify({
        status: "sent",
        to: input.supplier_email,
        subject: input.subject,
        sent_at: new Date().toISOString(),
        message_id: `msg_${Math.random().toString(36).slice(2, 9)}`,
      });
    },
  },
};

// ============================================================================
// SCENARIO RUNNER
// ============================================================================

interface Scenario {
  name: string;
  description: string;
  run: (tools: any, store: CredentialStore) => Promise<void>;
}

async function runScenario(
  scenario: Scenario,
  tools: any,
  store: CredentialStore
) {
  console.log(`\n${"=".repeat(70)}`);
  console.log(`SCENARIO: ${scenario.name}`);
  console.log(`${"=".repeat(70)}`);
  console.log(scenario.description);
  console.log("");

  try {
    await scenario.run(tools, store);
  } catch (error) {
    console.error(`ERROR: ${error instanceof Error ? error.message : error}`);
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log("\n╔════════════════════════════════════════════════════════════════════╗");
  console.log("║       USyd Procurement Agent — ATP Governance Example          ║");
  console.log("╚════════════════════════════════════════════════════════════════════╝\n");

  // Setup
  const credStore = new CredentialStore();
  credStore.register({
    provider: "usyd-finance-api",
    org_id: "usyd_org_123",
    scopes: ["read", "write"],
    type: "bearer_token",
    value: "[REDACTED_TOKEN]",
  });

  const evidenceBackend = new FileEvidenceBackend(
    "/sessions/modest-friendly-galileo/atp-protocol/examples/usyd-procurement/evidence"
  );

  // Wrap tools
  const governedTools = {
    QueryBudgetTool: new GovernedTool(mockTools.QueryBudgetTool, {
      contract: budgetQueryContract,
      wallet: "0xStaffMember123",
      org_id: "usyd_org_123",
      evidenceBackend,
      onDenied: (reason) =>
        console.log(`  ✗ DENIED: ${reason}`),
      onEvidence: (record) =>
        console.log(
          `  ✓ Evidenced: ${record.evidence_id} → ${record.outcome}`
        ),
    }),

    ValidateSupplierTool: new GovernedTool(mockTools.ValidateSupplierTool, {
      contract: supplierValidationContract,
      wallet: "0xStaffMember123",
      org_id: "usyd_org_123",
      evidenceBackend,
      onDenied: (reason) =>
        console.log(`  ✗ DENIED: ${reason}`),
      onEvidence: (record) =>
        console.log(
          `  ✓ Evidenced: ${record.evidence_id} → ${record.outcome}`
        ),
    }),

    DraftPOTool: new GovernedTool(mockTools.DraftPOTool, {
      contract: draftPoContract,
      wallet: "0xStaffMember123",
      org_id: "usyd_org_123",
      evidenceBackend,
      onDenied: (reason) =>
        console.log(`  ✗ DENIED: ${reason}`),
      onEvidence: (record) =>
        console.log(
          `  ✓ Evidenced: ${record.evidence_id} → ${record.outcome}`
        ),
    }),

    SubmitApprovalTool: new GovernedTool(mockTools.SubmitApprovalTool, {
      contract: submitApprovalContract,
      wallet: "0xStaffMember123",
      org_id: "usyd_org_123",
      evidenceBackend,
      onDenied: (reason) =>
        console.log(`  ✗ DENIED: ${reason}`),
      onEvidence: (record) =>
        console.log(
          `  ✓ Evidenced: ${record.evidence_id} → ${record.outcome}`
        ),
    }),

    SendCorrespondenceTool: new GovernedTool(mockTools.SendCorrespondenceTool, {
      contract: correspondenceContract,
      wallet: "0xStaffMember123",
      org_id: "usyd_org_123",
      evidenceBackend,
      onDenied: (reason) =>
        console.log(`  ✗ DENIED: ${reason}`),
      onEvidence: (record) =>
        console.log(
          `  ✓ Evidenced: ${record.evidence_id} → ${record.outcome}`
        ),
    }),
  };

  // Scenarios
  const scenarios: Scenario[] = [
    {
      name: "Small Office Supplies (Auto-Approved)",
      description:
        "Staff requests PO for $3,500 office supplies from preferred supplier.",
      run: async (tools) => {
        console.log("Step 1: Query budget for cost centre FN420301");
        const budget = await tools.QueryBudgetTool.invoke({
          cost_centre: "FN420301",
        });
        console.log(`  → ${budget}`);

        console.log("\nStep 2: Validate supplier 'Office Direct'");
        const validation = await tools.ValidateSupplierTool.invoke({
          supplier_name: "Office Direct",
        });
        console.log(`  → ${validation}`);

        console.log("\nStep 3: Draft PO for $3,500 (< $5k threshold)");
        const po = await tools.DraftPOTool.invoke({
          supplier: "Office Direct",
          amount: 3500,
          description: "Bulk office supplies (paper, toner, envelopes)",
          cost_centre: "FN420301",
        });
        console.log(`  → ${po}`);
        const poId = JSON.parse(po).po_id;

        console.log("\nStep 4: Submit for approval (auto-approved < $5k)");
        const approval = await tools.SubmitApprovalTool.invoke({ po_id: poId });
        console.log(`  → ${approval}`);
      },
    },

    {
      name: "Lab Equipment Request (Requires Explicit Approval)",
      description:
        "Staff requests PO for $25,000 lab equipment — exceeds approval threshold.",
      run: async (tools) => {
        console.log("Step 1: Query budget for cost centre FN430410");
        const budget = await tools.QueryBudgetTool.invoke({
          cost_centre: "FN430410",
        });
        console.log(`  → ${budget}`);

        console.log(
          "\nStep 2: Validate supplier 'LabTech Solutions' (preferred)"
        );
        const validation = await tools.ValidateSupplierTool.invoke({
          supplier_name: "LabTech Solutions",
        });
        console.log(`  → ${validation}`);

        console.log("\nStep 3: Draft PO for $25,000 (> $5k threshold)");
        const po = await tools.DraftPOTool.invoke({
          supplier: "LabTech Solutions",
          amount: 25000,
          description: "Spectrophotometer and accessories",
          cost_centre: "FN430410",
        });
        console.log(`  → ${po}`);
        const poId = JSON.parse(po).po_id;

        console.log(
          "\nStep 4: Submit for approval (requires Finance Director sign-off)"
        );
        const approval = await tools.SubmitApprovalTool.invoke({ po_id: poId });
        console.log(`  → ${approval}`);
        console.log(
          "  ⚠ NOTE: In production, this would route to Finance Director for review."
        );
        console.log(
          "         Actual approval/denial recorded in evidence backend."
        );
      },
    },

    {
      name: "Correspondence to Supplier (Always Requires Approval)",
      description:
        "Staff requests to send email to supplier — always requires explicit approval.",
      run: async (tools) => {
        console.log("Step 1: Attempt to send correspondence to supplier");
        console.log("  Message: Payment terms negotiation request");
        const result = await tools.SendCorrespondenceTool.invoke({
          supplier_email: "procurement@labtech.com.au",
          subject: "PO FN430410-45122: Payment Terms Discussion",
          body: "Dear LabTech,\n\nWe would like to discuss early-payment discount options for bulk orders...",
        });
        console.log(`  → ${result}`);
        console.log(
          "  ⚠ NOTE: Always requires explicit staff approval before sending."
        );
        console.log(
          "         Evidence of approval/denial captured for compliance."
        );
      },
    },

    {
      name: "Query Evidence Backend (Full Audit Trail)",
      description:
        "Review all recorded actions and policy evaluations from this session.",
      run: async () => {
        console.log("Querying evidence backend...\n");
        const allEvidence = await evidenceBackend.query({ limit: 50 });

        console.log(
          `Total evidence records: ${allEvidence.total}\n`
        );

        if (allEvidence.records.length === 0) {
          console.log("(No evidence records found)");
          return;
        }

        console.log("Evidence Summary:");
        console.log("-".repeat(70));

        const outcomes: Record<string, number> = {};
        const actions: Record<string, number> = {};

        for (const record of allEvidence.records) {
          console.log(`\n  Evidence ID: ${record.evidence_id}`);
          console.log(`  Action: ${record.action}`);
          console.log(`  Outcome: ${record.outcome}`);
          console.log(
            `  Timestamp: ${new Date(record.timestamps.evidenced_at).toLocaleString()}`
          );
          console.log(
            `  Wallet: ${record.requesting_wallet.slice(0, 10)}...`
          );

          outcomes[record.outcome] = (outcomes[record.outcome] ?? 0) + 1;
          actions[record.action] = (actions[record.action] ?? 0) + 1;
        }

        console.log("\n" + "-".repeat(70));
        console.log("Aggregate Metrics:");
        console.log(`  Outcomes: ${JSON.stringify(outcomes)}`);
        console.log(`  Actions: ${JSON.stringify(actions)}`);
      },
    },
  ];

  // Run all scenarios
  for (const scenario of scenarios) {
    await runScenario(scenario, governedTools, credStore);
  }

  console.log("\n" + "=".repeat(70));
  console.log("PROCUREMENT AGENT EXECUTION COMPLETE");
  console.log("=".repeat(70));
  console.log(
    "\nEvidence files written to: ./evidence/"
  );
  console.log(
    "Each file is a self-contained audit record with content hash verification.\n"
  );
}

main().catch(console.error);
