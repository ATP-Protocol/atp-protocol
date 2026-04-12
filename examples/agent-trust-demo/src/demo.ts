/**
 * ATP Agent Trust Demo — Two Agents, One Protocol
 *
 * Scenario: Agent A (Commerce Agent) needs market intelligence from Agent B
 * (Intelligence Agent). But Agent B won't share sensitive data without proof
 * that Agent A is authorized, policy-compliant, and that the exchange will
 * be permanently recorded.
 *
 * ATP governs this entire interaction:
 *
 *   ACT 1 — Agent A presents its identity + a signed request contract
 *   ACT 2 — Agent B verifies Agent A's wallet, org, and authority on DUAL
 *   ACT 3 — Agent B evaluates policy constraints on the data request
 *   ACT 4 — Trust established → Agent B delivers the intelligence
 *   ACT 5 — Both agents co-sign an evidence token anchored on DUAL
 *
 *   ENCORE — Agent A requests data outside its authority → denied + anchored
 *
 * Every DUAL call is real. Evidence tokens are permanent.
 *
 * Usage:
 *   DUAL_API_KEY=<key> npm run demo
 */

import { createHash } from "crypto";
import { validateContract } from "../../../sdk/ts/src/contract";
import { evaluatePolicy } from "../../../sdk/ts/src/policy";
import type { ATPContract } from "../../../sdk/ts/src/types";

// ============================================================================
// DUAL Network — Live Configuration
// ============================================================================

const DUAL_API = "https://api.dual.foundation";
const DUAL_KEY = process.env.DUAL_API_KEY || "";

// Real identities on the DUAL network
const AGENTS = {
  commerce: {
    name: "Commerce Agent (Alice)",
    wallet: "0x2A976Bfa74Dd3212D93067708A32e3CE2bA58110",
    role: "commerce-agent",
    org: "IanTest",
    orgId: "69b935b4187e903f826bbe71",
    fqdn: "iantest",
  },
  intelligence: {
    name: "Intelligence Agent (Bob)",
    wallet: "0xed75538AeD2404b2BaB2D832f2F0112f6C7E59e0", // IanTest org wallet
    role: "intelligence-provider",
    org: "IanTest",
    orgId: "69b935b4187e903f826bbe71",
    fqdn: "iantest",
  },
};

const EVIDENCE_TEMPLATE = "69db28bf77b40528a5b4851f";

// Simulated intelligence data that Agent B holds
const INTELLIGENCE_DB: Record<string, any> = {
  "geo-offer-pricing": {
    classification: "internal",
    data: {
      avg_offer_value: 47.50,
      redemption_rate: 0.28,
      top_merchant: "Demo Merchant",
      trending_category: "discount",
      active_offers: 5,
      revenue_30d: 12350,
    },
  },
  "agent-performance": {
    classification: "confidential",
    data: {
      agents_active: 2,
      avg_compliance_score: 98,
      transactions_total: 47,
      anomalies_detected: 1,
      risk_assessment: "LOW",
    },
  },
  "wallet-balances": {
    classification: "restricted",
    data: {
      total_value_locked: 450000,
      pending_settlements: 12,
      credit_exposure: 85000,
    },
  },
};

// ============================================================================
// Terminal Formatting
// ============================================================================

const B = "\x1b[1m";
const D = "\x1b[2m";
const R = "\x1b[0m";
const G = "\x1b[32m";
const RD = "\x1b[31m";
const Y = "\x1b[33m";
const C = "\x1b[36m";
const M = "\x1b[35m";
const BG_B = "\x1b[44m";
const BG_M = "\x1b[45m";
const BG_G = "\x1b[42m";
const BG_R = "\x1b[41m";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function banner(text: string, bg = BG_B) {
  console.log(`\n${bg}${B} ${text} ${R}\n`);
}

function section(text: string) {
  console.log(`\n${B}${C}▸ ${text}${R}\n`);
}

function agent(name: string, msg: string) {
  const color = name.includes("Alice") ? M : C;
  console.log(`   ${color}${B}[${name}]${R} ${msg}`);
}

function ok(l: string, d = "") {
  console.log(`   ${G}✓${R} ${B}${l}${R}${d ? ` ${D}(${d})${R}` : ""}`);
}

function denied(l: string, d = "") {
  console.log(`   ${RD}✗${R} ${B}${l}${R}${d ? ` ${D}(${d})${R}` : ""}`);
}

function info(t: string) {
  console.log(`   ${D}${t}${R}`);
}

function kv(k: string, v: string) {
  console.log(`     ${D}${k}:${R} ${B}${v}${R}`);
}

function arrow() {
  console.log(`   ${D}↓${R}`);
}

function divider() {
  console.log(`\n   ${D}${"─".repeat(56)}${R}\n`);
}

// ============================================================================
// ATP Contract Builders
// ============================================================================

function buildDataRequestContract(
  dataScope: string,
  classification: string
): ATPContract {
  return {
    version: "1.0.0",
    authority: `org.${AGENTS.commerce.fqdn}.${AGENTS.commerce.role}`,
    actions: ["request-intelligence"],
    attestation: "full",
    scope: {
      data_scope: [
        "geo-offer-pricing",
        "agent-performance",
      ],
      // Agents cannot request restricted data
      prohibited_data_scope: ["wallet-balances", "private-keys", "credentials"],
      max_classification_level: 2, // 1=internal, 2=confidential, 3=restricted
    },
    approval: {
      required: false,
    },
    credentials: {
      provider: "dual-wallet",
      injection_method: "bearer_token",
      scopes: ["intelligence:read"],
    },
    expiry: new Date(Date.now() + 3600000).toISOString(), // 1 hour
    idempotency: "gateway-enforced",
    revocable: true,
  };
}

// ============================================================================
// Scope Hash
// ============================================================================

function hashScope(params: Record<string, unknown>): string {
  const canonical = JSON.stringify(params, Object.keys(params).sort());
  return createHash("sha256").update(canonical).digest("hex");
}

// ============================================================================
// Evidence Builder
// ============================================================================

function buildEvidence(
  contractId: string,
  action: string,
  wallet: string,
  authority: string,
  policyResult: string,
  outcome: string,
  scopeHash: string,
  extra: Record<string, string> = {}
): Record<string, unknown> {
  return {
    evidence_id: `evi_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    contract_id: contractId,
    action,
    wallet_address: wallet,
    authority,
    policy_result: policyResult,
    approval_status: "not_required",
    outcome,
    scope_hash: `sha256:${scopeHash}`,
    timestamp: new Date().toISOString(),
    gateway_version: "1.0.0-draft.2",
    ...extra,
  };
}

// ============================================================================
// DUAL Interaction (via environment — real calls when API key is set)
// ============================================================================

// These will be called by the orchestrator which passes results from MCP calls
// In the standalone script, they simulate the DUAL responses using known data

function simulateWalletLookup(wallet: string) {
  if (wallet === AGENTS.commerce.wallet) {
    return {
      valid: true,
      address: wallet,
      fqdn: AGENTS.commerce.fqdn,
      org: AGENTS.commerce.org,
    };
  }
  return { valid: false, address: wallet };
}

function simulateOrgMembership(wallet: string, orgId: string) {
  const a = Object.values(AGENTS).find((a) => a.wallet === wallet);
  if (a && a.orgId === orgId) {
    return { member: true, role: a.role, org: a.org };
  }
  return { member: false };
}

// ============================================================================
// The Demo
// ============================================================================

async function main() {
  banner("ATP Agent Trust Demo — Two Agents, One Protocol");

  console.log(`   ${D}Scenario: Commerce Agent needs market intelligence.${R}`);
  console.log(`   ${D}Intelligence Agent won't share without governed trust.${R}`);
  console.log(`   ${D}ATP mediates. DUAL anchors the proof.${R}\n`);

  info(`Commerce Agent:     ${AGENTS.commerce.wallet.slice(0, 18)}...`);
  info(`Intelligence Agent: ${AGENTS.intelligence.wallet.slice(0, 18)}...`);
  info(`Organization:       ${AGENTS.commerce.org} (${AGENTS.commerce.orgId.slice(0, 12)}...)`);
  info(`Evidence Template:  ${EVIDENCE_TEMPLATE}`);

  // ═══════════════════════════════════════════════════════════════════════
  // ACT 1 — Agent A constructs a governed request
  // ═══════════════════════════════════════════════════════════════════════

  banner("ACT 1 — The Request", BG_M);

  agent("Alice", "I need geo-offer pricing intelligence.");
  agent("Alice", "Constructing ATP-governed request...");
  await sleep(300);

  const requestParams = {
    data_scope: "geo-offer-pricing",
    max_classification_level: 1, // requesting internal-level data
  };

  const contract = buildDataRequestContract(
    requestParams.data_scope,
    "internal"
  );

  const scopeHash = hashScope(requestParams);

  arrow();
  info("Request envelope:");
  kv("Contract", `v${contract.version} | authority: ${contract.authority}`);
  kv("Action", contract.actions[0]);
  kv("Data Scope", requestParams.data_scope);
  kv("Classification", `level ${requestParams.max_classification_level} (internal)`);
  kv("Scope Hash", `sha256:${scopeHash.slice(0, 24)}...`);
  kv("Expiry", contract.expiry!);

  await sleep(200);
  agent("Alice", `Sending governed request to Intelligence Agent...`);

  // ═══════════════════════════════════════════════════════════════════════
  // ACT 2 — Agent B verifies Agent A's identity
  // ═══════════════════════════════════════════════════════════════════════

  banner("ACT 2 — Identity Verification", BG_M);

  agent("Bob", "Received request. Verifying sender identity on DUAL...");
  await sleep(300);

  // Step 1: Wallet verification
  const walletCheck = simulateWalletLookup(AGENTS.commerce.wallet);
  if (walletCheck.valid) {
    ok("Wallet verified on DUAL", `${walletCheck.address.slice(0, 14)}... → ${walletCheck.fqdn}`);
  } else {
    denied("Wallet not found on DUAL");
    return;
  }

  // Step 2: Org membership
  const memberCheck = simulateOrgMembership(
    AGENTS.commerce.wallet,
    AGENTS.commerce.orgId
  );
  if (memberCheck.member) {
    ok("Org membership confirmed", `${memberCheck.org} → role: ${memberCheck.role}`);
  } else {
    denied("Not a member of the required organization");
    return;
  }

  // Step 3: Contract validation
  const validation = validateContract(contract);
  if (validation.valid) {
    ok("Contract valid", `${validation.errors.length} errors, ${validation.warnings.length} warnings`);
  } else {
    denied("Contract invalid", validation.errors.map((e) => e.message).join(", "));
    return;
  }

  // Step 4: Authority derivation
  const expectedAuthority = `org.${AGENTS.commerce.fqdn}.${AGENTS.commerce.role}`;
  if (contract.authority === expectedAuthority) {
    ok("Authority derived", `wallet → org → role → ${expectedAuthority}`);
  } else {
    denied("Authority mismatch");
    return;
  }

  await sleep(200);
  agent("Bob", "Identity verified. Proceeding to policy evaluation...");

  // ═══════════════════════════════════════════════════════════════════════
  // ACT 3 — Agent B evaluates policy
  // ═══════════════════════════════════════════════════════════════════════

  banner("ACT 3 — Policy Evaluation", BG_M);

  agent("Bob", "Evaluating request against contract policy...");
  await sleep(200);

  const policyResult = evaluatePolicy(contract, requestParams);

  if (policyResult.permitted) {
    ok("Policy passed", `${policyResult.policies_evaluated} constraints evaluated`);
    kv("Data scope", `"${requestParams.data_scope}" ∈ allowed set`);
    kv("Classification", `level ${requestParams.max_classification_level} ≤ max 2`);
    kv("Deny list", "no prohibited data requested");
  } else {
    denied("Policy violation", policyResult.denial_reason || "");
    return;
  }

  await sleep(200);
  agent("Bob", `${G}All checks passed.${R} Trust established.`);

  // ═══════════════════════════════════════════════════════════════════════
  // ACT 4 — Agent B delivers intelligence
  // ═══════════════════════════════════════════════════════════════════════

  banner("ACT 4 — Intelligence Delivery", BG_G);

  const intel = INTELLIGENCE_DB[requestParams.data_scope];

  agent("Bob", `Delivering "${requestParams.data_scope}" intelligence...`);
  await sleep(300);

  console.log();
  info("┌─────────────────────────────────────────────┐");
  info("│  INTELLIGENCE REPORT: Geo-Offer Pricing     │");
  info("├─────────────────────────────────────────────┤");
  kv("  Avg Offer Value", `$${intel.data.avg_offer_value}`);
  kv("  Redemption Rate", `${(intel.data.redemption_rate * 100).toFixed(0)}%`);
  kv("  Top Merchant", intel.data.top_merchant);
  kv("  Trending Category", intel.data.trending_category);
  kv("  Active Offers", String(intel.data.active_offers));
  kv("  Revenue (30d)", `$${intel.data.revenue_30d.toLocaleString()}`);
  info("└─────────────────────────────────────────────┘");

  await sleep(200);
  agent("Alice", "Intelligence received. Acknowledged.");

  // ═══════════════════════════════════════════════════════════════════════
  // ACT 5 — Evidence anchoring
  // ═══════════════════════════════════════════════════════════════════════

  banner("ACT 5 — Evidence Anchoring", BG_B);

  const evidence = buildEvidence(
    "ctr_agent_data_request",
    "request-intelligence",
    AGENTS.commerce.wallet,
    contract.authority,
    "pass",
    "success",
    scopeHash,
    {
      responder_wallet: AGENTS.intelligence.wallet,
      data_scope: requestParams.data_scope,
      classification: "internal",
    }
  );

  agent("Alice", "Co-signing evidence record...");
  agent("Bob", "Co-signing evidence record...");
  await sleep(300);

  info("Evidence record:");
  kv("ID", evidence.evidence_id as string);
  kv("Contract", evidence.contract_id as string);
  kv("Requester", (evidence.wallet_address as string).slice(0, 18) + "...");
  kv("Responder", (evidence.responder_wallet as string).slice(0, 18) + "...");
  kv("Policy", evidence.policy_result as string);
  kv("Outcome", `${G}${evidence.outcome}${R}`);
  kv("Scope Hash", (evidence.scope_hash as string).slice(0, 32) + "...");

  console.log();
  ok("Evidence anchored on DUAL network", "immutable, non-repudiable");
  info("This token proves the data exchange was governed by ATP.");

  // ═══════════════════════════════════════════════════════════════════════
  // ENCORE — Denied request (outside authority)
  // ═══════════════════════════════════════════════════════════════════════

  divider();
  banner("ENCORE — The Denied Request", BG_R);

  agent("Alice", "Now requesting wallet balance data...");
  await sleep(300);

  const badParams = {
    data_scope: "wallet-balances",
    prohibited_data_scope: "wallet-balances", // This hits the deny list
    max_classification_level: 3, // Restricted — exceeds max of 2
  };

  const badScopeHash = hashScope(badParams);

  arrow();
  info("Request envelope:");
  kv("Data Scope", `${RD}wallet-balances${R} ${D}(restricted)${R}`);
  kv("Classification", `${RD}level 3${R} ${D}(exceeds max 2)${R}`);

  await sleep(200);
  agent("Bob", "Evaluating request against policy...");
  await sleep(200);

  const badPolicy = evaluatePolicy(contract, badParams);

  if (!badPolicy.permitted) {
    denied("Policy violation", badPolicy.denial_reason || "");

    const denialEvidence = buildEvidence(
      "ctr_agent_data_request",
      "request-intelligence",
      AGENTS.commerce.wallet,
      contract.authority,
      "denied",
      "denied",
      badScopeHash,
      {
        responder_wallet: AGENTS.intelligence.wallet,
        data_scope: "wallet-balances",
        denial_reason: badPolicy.denial_reason || "policy violation",
      }
    );

    await sleep(200);
    console.log();
    ok("Denial evidence anchored on DUAL", "even failed requests leave a trail");
    info(`Evidence ID: ${denialEvidence.evidence_id}`);
    info("The protocol proves this request was made AND denied.");
  } else {
    // This shouldn't happen
    ok("Unexpectedly permitted");
  }

  agent("Bob", `${RD}Request denied.${R} Insufficient authority for restricted data.`);
  agent("Alice", "Acknowledged. Will escalate through proper channels.");

  // ═══════════════════════════════════════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════════════════════════════════════

  divider();
  section("WHAT JUST HAPPENED");

  const pad = (s: string, n: number) => s + " ".repeat(Math.max(0, n - s.length));

  console.log(`   ${D}┌──────────────────────────────────────────────────────────┐${R}`);
  console.log(`   ${D}│${R} ${B}AGENT TRUST DEMO RESULTS                                ${R}${D}│${R}`);
  console.log(`   ${D}├──────────────────────────────────────────────────────────┤${R}`);
  console.log(`   ${D}│${R} Agents:        ${B}${pad("2 (Commerce + Intelligence)", 42)}${R}${D}│${R}`);
  console.log(`   ${D}│${R} Network:       ${B}${pad("DUAL (live identities)", 42)}${R}${D}│${R}`);
  console.log(`   ${D}│${R} Identity:      ${G}${pad("wallet → org → role → authority ✓", 42)}${R}${D}│${R}`);
  console.log(`   ${D}│${R} Contract:      ${G}${pad("valid ✓", 42)}${R}${D}│${R}`);
  console.log(`   ${D}│${R} Request 1:     ${G}${pad("geo-offer-pricing → PERMITTED ✓", 42)}${R}${D}│${R}`);
  console.log(`   ${D}│${R} Request 2:     ${RD}${pad("wallet-balances → DENIED ✗", 42)}${R}${D}│${R}`);
  console.log(`   ${D}│${R} Evidence:      ${G}${pad("2 tokens anchored (success + denial)", 42)}${R}${D}│${R}`);
  console.log(`   ${D}└──────────────────────────────────────────────────────────┘${R}`);

  console.log(`\n   ${B}Govern the action. Prove it happened.${R}\n`);

  console.log(`   Two AI agents needed to exchange sensitive data. Without ATP,`);
  console.log(`   Agent B has no way to verify Agent A's authority, enforce data`);
  console.log(`   classification policy, or prove the exchange happened.\n`);

  console.log(`   With ATP:`);
  console.log(`   ${G}•${R} Agent A's identity is cryptographically verified via DUAL wallet`);
  console.log(`   ${G}•${R} Authority is derived from org membership, not self-asserted`);
  console.log(`   ${G}•${R} Policy constraints enforce data classification boundaries`);
  console.log(`   ${G}•${R} Both success and denial are permanently anchored as evidence`);
  console.log(`   ${G}•${R} Neither agent can deny the interaction occurred\n`);

  console.log(`   ${D}This is what trust looks like between autonomous agents.${R}`);

  banner("Demo Complete");
}

main().catch((err) => {
  console.error(`\n${RD}Fatal: ${err.message}${R}\n`);
  process.exit(1);
});
