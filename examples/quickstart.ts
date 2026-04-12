#!/usr/bin/env node

/**
 * ATP Quickstart Example
 *
 * Demonstrates the core ATP workflow in a single file:
 * 1. Define an ATP contract with rate-limiting policy
 * 2. Create a credential store and register credentials
 * 3. Set up an in-memory evidence backend
 * 4. Create a mock email tool
 * 5. Wrap it with ATP governance
 * 6. Execute permitted and denied requests
 * 7. Query the evidence backend to show what was recorded
 */

import {
  validateContract,
  evaluatePolicy,
  CredentialStore,
  buildEvidence,
  MemoryEvidenceBackend,
  GovernedTool,
} from "@atp-protocol/sdk";
import type { ATPContract, EvidenceRecord } from "@atp-protocol/sdk";

// ============================================================================
// 1. DEFINE AN ATP CONTRACT
// ============================================================================

// Simple contract for an email-send tool with rate-limiting policy
const emailContract: ATPContract = {
  version: "1.0.0",
  authority: "org.acme.send-email",
  actions: ["send-email"],
  attestation: "light",
  // Scope defines policy constraints
  scope: {
    // Rate limit: max 5 emails per execution window
    email_count: 5,
    // Allow list of approved domains
    approved_domains: ["@acme.com", "@vendor-approved.com"],
  },
};

// ============================================================================
// 2. VALIDATE THE CONTRACT
// ============================================================================

console.log("\n=== ATP QUICKSTART ===\n");
console.log("Step 1: Validating contract...");
const validation = validateContract(emailContract);
if (validation.valid) {
  console.log("✓ Contract is valid");
} else {
  console.error("✗ Contract validation failed:", validation.errors);
  process.exit(1);
}

// ============================================================================
// 3. CREDENTIAL STORE
// ============================================================================

console.log("\nStep 2: Setting up credential store...");
const credStore = new CredentialStore();

// Register a mock API key (in production, these come from env/vault)
credStore.register({
  provider: "sendgrid-api",
  org_id: "org_acme_123",
  scopes: ["mail.send"],
  type: "api_key",
  value: "[REDACTED]", // In production, never log the actual value
});

console.log("✓ Credential registered for sendgrid-api");

// ============================================================================
// 4. EVIDENCE BACKEND
// ============================================================================

console.log("\nStep 3: Creating evidence backend...");
const evidenceBackend = new MemoryEvidenceBackend();
console.log("✓ In-memory evidence backend created");

// ============================================================================
// 5. MOCK TOOL IMPLEMENTATION
// ============================================================================

// A simple mock email tool that would normally call SendGrid/Gmail/etc.
const mockEmailTool = {
  name: "send-email",
  description: "Send an email via the organization email service",
  invoke: async (input: {
    to: string;
    subject: string;
    body: string;
  }): Promise<string> => {
    // In a real implementation, this would call an external API
    console.log(
      `  → Simulating email send to ${input.to}: "${input.subject}"`
    );
    return JSON.stringify({
      status: "sent",
      message_id: `msg_${Math.random().toString(36).slice(2, 9)}`,
      timestamp: new Date().toISOString(),
    });
  },
};

// ============================================================================
// 6. GOVERN THE TOOL WITH ATP
// ============================================================================

console.log("\nStep 4: Wrapping tool with ATP governance...");

const governedEmailTool = new GovernedTool({
  contract: emailContract,
  wallet: "0xDeveloper123",
  org_id: "org_acme_123",
  evidenceBackend,
  onDenied: (reason, args) => {
    console.log(`  ⚠ Request DENIED: ${reason}`);
  },
  onEvidence: (record) => {
    console.log(
      `  ✓ Evidence recorded: ${record.evidence_id} (${record.outcome})`
    );
  },
});

console.log(`✓ Tool governed: ${governedEmailTool.name}`);

// ============================================================================
// 7. EXECUTE PERMITTED REQUEST
// ============================================================================

console.log("\nStep 5: Executing PERMITTED request...");
console.log("Request: Send email to alice@acme.com");

const permitResult = await governedEmailTool.invoke({
  to: "alice@acme.com",
  subject: "Welcome!",
  body: "Hello Alice",
});

console.log(`Outcome: ${permitResult.outcome}`);
console.log(`Permitted: ${permitResult.permitted}`);
if (permitResult.output) {
  console.log(`Response: ${permitResult.output}`);
}

// ============================================================================
// 8. EXECUTE DENIED REQUEST (policy violation)
// ============================================================================

console.log("\nStep 6: Executing DENIED request (policy violation)...");
console.log("Request: Send email to bob@untrusted-domain.com");

const denyResult = await governedEmailTool.invoke({
  to: "bob@untrusted-domain.com",
  subject: "Hello Bob",
  body: "This should fail the domain policy",
});

console.log(`Outcome: ${denyResult.outcome}`);
console.log(`Permitted: ${denyResult.permitted}`);
if (denyResult.denial_reason) {
  console.log(`Denial reason: ${denyResult.denial_reason}`);
}

// ============================================================================
// 9. QUERY EVIDENCE BACKEND
// ============================================================================

console.log("\nStep 7: Querying evidence backend...");

const allEvidence = await evidenceBackend.query({
  limit: 10,
});

console.log(`Total evidence records: ${allEvidence.total}`);
console.log("\nEvidence Summary:");

for (const record of allEvidence.records) {
  const action = record.scope_snapshot?.to || "unknown";
  console.log(`  - ${record.evidence_id}`);
  console.log(`    Action: ${record.action}`);
  console.log(`    To: ${action}`);
  console.log(`    Outcome: ${record.outcome}`);
  console.log(`    Recorded at: ${record.timestamps.evidenced_at}`);
}

// ============================================================================
// 10. DEMONSTRATE POLICY EVALUATION
// ============================================================================

console.log("\nStep 8: Direct policy evaluation...");

const goodPolicy = evaluatePolicy(emailContract, {
  to: "alice@acme.com",
  email_count: 3,
});

console.log(`Policy check (alice@acme.com, count=3): ${
  goodPolicy.permitted ? "✓ PERMITTED" : "✗ DENIED"
}`);

const badPolicy = evaluatePolicy(emailContract, {
  to: "bob@untrusted-domain.com",
  email_count: 2,
});

console.log(`Policy check (bob@untrusted-domain.com, count=2): ${
  badPolicy.permitted ? "✓ PERMITTED" : "✗ DENIED"
}`);
if (!badPolicy.permitted) {
  console.log(`  Reason: ${badPolicy.denial_reason}`);
}

// ============================================================================
// SUMMARY
// ============================================================================

console.log("\n=== QUICKSTART COMPLETE ===");
console.log("\nKey Takeaways:");
console.log("1. Contracts define both policy AND approval/credential configs");
console.log("2. Policy evaluation is fast (local, no network required)");
console.log("3. All executions are recorded as evidence (permitted or denied)");
console.log("4. Tools are wrapped transparently — agents don't see the governance");
console.log("\nNext steps: Read CLAUDE.md in the atp-protocol repo for advanced topics.\n");
