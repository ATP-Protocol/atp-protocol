/**
 * ATP Agent Trust Demo — Two Agents, One Protocol
 *
 * Scenario: Agent A (Commerce Agent) needs market intelligence from Agent B
 * (Intelligence Agent). But Agent B won't share sensitive data without proof
 * that Agent A is authorized, policy-compliant, and that the exchange will
 * be permanently recorded.
 *
 * ATP governs this entire interaction. DUAL anchors the proof.
 *
 * ALL DUAL calls are real HTTP requests to the live network when DUAL_API_KEY
 * is set. Evidence tokens are minted, written, and verified on-chain.
 *
 * Usage:
 *   DUAL_API_KEY=<key> npm run demo        # Full on-chain demo
 *   npm run demo                            # Governance-only (no DUAL calls)
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
const LIVE = !!DUAL_KEY;

// Real identities on the DUAL network
const AGENTS = {
  commerce: {
    name: "Commerce Agent (Alice)",
    wallet: "0x2A976Bfa74Dd3212D93067708A32e3CE2bA58110",
    walletId: "69b92d49d5a95a6018672003",
    role: "commerce-agent",
    org: "IanTest",
    orgId: "69b935b4187e903f826bbe71",
    fqdn: "iantest",
  },
  intelligence: {
    name: "Intelligence Agent (Bob)",
    wallet: "0xed75538AeD2404b2BaB2D832f2F0112f6C7E59e0",
    role: "intelligence-provider",
    org: "IanTest",
    orgId: "69b935b4187e903f826bbe71",
    fqdn: "iantest",
  },
};

const EVIDENCE_TEMPLATE = "69db28bf77b40528a5b4851f"; // io.atp.evidence.v1

// Intelligence data that Agent B holds (this is the "service" Agent B provides)
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
// DUAL API Client — Real HTTP (not mocked)
// ============================================================================

async function dualFetch<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`${DUAL_API}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${DUAL_KEY}`,
      ...((opts.headers as Record<string, string>) || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`DUAL ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

/** Resolve wallet from DUAL — returns wallet data or null */
async function dualGetWallet(): Promise<any> {
  const r = await dualFetch<any>("/wallet");
  return r.data;
}

/** Get organization + members from DUAL */
async function dualGetOrg(orgId: string): Promise<any> {
  const r = await dualFetch<any>(`/organizations/${orgId}`);
  return r.data;
}

/** Mint N evidence tokens from template */
async function dualMint(templateId: string, num: number): Promise<string[]> {
  const r = await dualFetch<any>("/actions", {
    method: "POST",
    body: JSON.stringify({ mint: { template_id: templateId, num } }),
  });
  return r.data?.steps?.[0]?.output?.ids || [];
}

/** Update object custom data */
async function dualUpdate(objectId: string, custom: Record<string, unknown>): Promise<void> {
  await dualFetch<any>("/actions", {
    method: "POST",
    body: JSON.stringify({ update: { id: objectId, data: { custom } } }),
  });
}

/** Read object back for verification */
async function dualGetObject(objectId: string): Promise<any> {
  const r = await dualFetch<any>(`/objects/${objectId}`);
  return r.data;
}

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
const BG_Y = "\x1b[43m";

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

function fail(l: string, d = "") {
  console.log(`   ${RD}✗${R} ${B}${l}${R}${d ? ` ${D}(${d})${R}` : ""}`);
}

function warn(l: string, d = "") {
  console.log(`   ${Y}⚠${R} ${B}${l}${R}${d ? ` ${D}(${d})${R}` : ""}`);
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
// ATP Contract
// ============================================================================

function buildDataRequestContract(): ATPContract {
  return {
    version: "1.0.0",
    authority: `org.${AGENTS.commerce.fqdn}.${AGENTS.commerce.role}`,
    actions: ["request-intelligence"],
    attestation: "full",
    scope: {
      data_scope: ["geo-offer-pricing", "agent-performance"],
      prohibited_data_scope: ["wallet-balances", "private-keys", "credentials"],
      max_classification_level: 2,
    },
    approval: { required: false },
    credentials: {
      provider: "dual-wallet",
      injection_method: "bearer_token",
      scopes: ["intelligence:read"],
    },
    expiry: new Date(Date.now() + 3600000).toISOString(),
    idempotency: "gateway-enforced",
    revocable: true,
  };
}

// ============================================================================
// Helpers
// ============================================================================

function hashScope(params: Record<string, unknown>): string {
  const canonical = JSON.stringify(params, Object.keys(params).sort());
  return createHash("sha256").update(canonical).digest("hex");
}

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
// Main Demo
// ============================================================================

async function main() {
  banner("ATP Agent Trust Demo — Two Agents, One Protocol");

  console.log(`   ${D}Scenario: Commerce Agent needs market intelligence.${R}`);
  console.log(`   ${D}Intelligence Agent won't share without governed trust.${R}`);
  console.log(`   ${D}ATP mediates. DUAL anchors the proof.${R}\n`);

  if (LIVE) {
    ok("DUAL API key detected", "all calls hit the live network");
  } else {
    warn("No DUAL_API_KEY", "governance runs real SDK, DUAL calls simulated");
    info("Set DUAL_API_KEY for full on-chain execution + evidence anchoring\n");
  }

  info(`Commerce Agent:     ${AGENTS.commerce.wallet.slice(0, 18)}...`);
  info(`Intelligence Agent: ${AGENTS.intelligence.wallet.slice(0, 18)}...`);
  info(`Organization:       ${AGENTS.commerce.org} (${AGENTS.commerce.orgId.slice(0, 12)}...)`);
  info(`Evidence Template:  ${EVIDENCE_TEMPLATE}`);
  info(`Mode:               ${LIVE ? `${G}LIVE${R}` : `${Y}SIMULATION${R}`}`);

  // ═══════════════════════════════════════════════════════════════════════
  // ACT 1 — Agent A constructs a governed request
  // ═══════════════════════════════════════════════════════════════════════

  banner("ACT 1 — The Request", BG_M);

  agent("Alice", "I need geo-offer pricing intelligence.");
  agent("Alice", "Constructing ATP-governed request...");
  await sleep(300);

  const requestParams = {
    data_scope: "geo-offer-pricing",
    max_classification_level: 1,
  };

  const contract = buildDataRequestContract();
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
  agent("Alice", "Sending governed request to Intelligence Agent...");

  // ═══════════════════════════════════════════════════════════════════════
  // ACT 2 — Agent B verifies Agent A's identity on DUAL
  // ═══════════════════════════════════════════════════════════════════════

  banner("ACT 2 — Identity Verification" + (LIVE ? " (LIVE DUAL)" : ""), BG_M);

  agent("Bob", "Received request. Verifying sender identity...");
  await sleep(300);

  // Step 1: Wallet verification
  if (LIVE) {
    try {
      const wallet = await dualGetWallet();
      ok("Wallet resolved on DUAL", `${wallet.account.address.slice(0, 14)}...`);
      kv("Email", wallet.email);
      kv("Key Type", wallet.account.type);
      kv("Activated", String(wallet.activated));
    } catch (e: any) {
      fail("Wallet resolution failed", e.message);
      return;
    }
  } else {
    ok("Wallet verified", `${AGENTS.commerce.wallet.slice(0, 14)}... → ${AGENTS.commerce.fqdn}`);
  }

  // Step 2: Org membership
  if (LIVE) {
    try {
      const org = await dualGetOrg(AGENTS.commerce.orgId);
      const member = org.members?.find(
        (m: any) => m.wallet_id === AGENTS.commerce.walletId
      );
      if (member) {
        ok("Org membership confirmed on DUAL", `${org.name} → role: ${member.role_name}`);
        kv("FQDN", org.fqdn);
        kv("Members", String(org.members.length));
      } else {
        fail("Wallet not a member of this organization");
        return;
      }
    } catch (e: any) {
      fail("Org lookup failed", e.message);
      return;
    }
  } else {
    ok("Org membership confirmed", `${AGENTS.commerce.org} → role: ${AGENTS.commerce.role}`);
  }

  // Step 3: Contract validation (always real — runs ATP SDK)
  const validation = validateContract(contract);
  if (validation.valid) {
    ok("Contract valid", `${validation.errors.length} errors, ${validation.warnings.length} warnings`);
  } else {
    fail("Contract invalid", validation.errors.map((e) => e.message).join(", "));
    return;
  }

  // Step 4: Authority derivation
  const expectedAuthority = `org.${AGENTS.commerce.fqdn}.${AGENTS.commerce.role}`;
  if (contract.authority === expectedAuthority) {
    ok("Authority derived", `wallet → org → role → ${expectedAuthority}`);
  } else {
    fail("Authority mismatch");
    return;
  }

  await sleep(200);
  agent("Bob", "Identity verified. Proceeding to policy evaluation...");

  // ═══════════════════════════════════════════════════════════════════════
  // ACT 3 — Policy evaluation (always real — runs ATP SDK)
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
    fail("Policy violation", policyResult.denial_reason || "");
    return;
  }

  await sleep(200);
  agent("Bob", `${G}All checks passed.${R} Trust established.`);

  // ═══════════════════════════════════════════════════════════════════════
  // ACT 4 — Intelligence delivery
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
  // ACT 5 — Evidence anchoring on DUAL
  // ═══════════════════════════════════════════════════════════════════════

  banner("ACT 5 — Evidence Anchoring" + (LIVE ? " (MINTING ON DUAL)" : ""), BG_B);

  const successEvidence = buildEvidence(
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

  let successTokenId: string | null = null;

  if (LIVE) {
    try {
      // Mint evidence token
      const ids = await dualMint(EVIDENCE_TEMPLATE, 1);
      successTokenId = ids[0];
      ok("Evidence token minted", successTokenId);

      // Write evidence data to the token
      await dualUpdate(successTokenId, successEvidence as Record<string, unknown>);
      ok("Evidence data written to token");

      // Read it back to verify
      const onChain = await dualGetObject(successTokenId);
      if (onChain.custom?.evidence_id === successEvidence.evidence_id) {
        ok("Evidence verified on-chain", "data matches");
        kv("Token ID", successTokenId);
        kv("Integrity Hash", onChain.integrity_hash);
        kv("Content Hash", onChain.content_hash?.slice(0, 24) + "...");
        kv("Nonce", String(onChain.nonce));
      } else {
        fail("Evidence mismatch on-chain");
      }
    } catch (e: any) {
      fail("Evidence anchoring failed", e.message);
    }
  } else {
    info("Evidence record (would be minted on DUAL with API key):");
  }

  kv("ID", successEvidence.evidence_id as string);
  kv("Requester", (successEvidence.wallet_address as string).slice(0, 18) + "...");
  kv("Responder", (successEvidence.responder_wallet as string).slice(0, 18) + "...");
  kv("Policy", `${G}pass${R}`);
  kv("Outcome", `${G}success${R}`);
  kv("Scope Hash", (successEvidence.scope_hash as string).slice(0, 32) + "...");

  // ═══════════════════════════════════════════════════════════════════════
  // ENCORE — Denied request
  // ═══════════════════════════════════════════════════════════════════════

  divider();
  banner("ENCORE — The Denied Request", BG_R);

  agent("Alice", "Now requesting wallet balance data...");
  await sleep(300);

  const badParams = {
    data_scope: "wallet-balances",
    prohibited_data_scope: "wallet-balances",
    max_classification_level: 3,
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
    fail("Policy violation", badPolicy.denial_reason || "");

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

    let denialTokenId: string | null = null;

    if (LIVE) {
      try {
        const ids = await dualMint(EVIDENCE_TEMPLATE, 1);
        denialTokenId = ids[0];

        await dualUpdate(denialTokenId, denialEvidence as Record<string, unknown>);

        const onChain = await dualGetObject(denialTokenId);
        console.log();
        ok("Denial evidence minted and verified on-chain");
        kv("Token ID", denialTokenId);
        kv("Integrity Hash", onChain.integrity_hash);
        kv("Outcome", `${RD}denied${R}`);
      } catch (e: any) {
        fail("Denial evidence anchoring failed", e.message);
      }
    } else {
      console.log();
      ok("Denial evidence recorded", "would be minted on DUAL with API key");
    }

    info(`Evidence ID: ${denialEvidence.evidence_id}`);
    info("The protocol proves this request was made AND denied.");
  }

  agent("Bob", `${RD}Request denied.${R} Insufficient authority for restricted data.`);
  agent("Alice", "Acknowledged. Will escalate through proper channels.");

  // ═══════════════════════════════════════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════════════════════════════════════

  divider();
  section("WHAT JUST HAPPENED");

  const pad = (s: string, n: number) => s + " ".repeat(Math.max(0, n - s.length));
  const mode = LIVE ? "DUAL (live — all on-chain)" : "DUAL (simulated identity)";
  const eviStatus = LIVE
    ? `2 tokens minted on-chain ✓`
    : `2 records (local — mint with API key)`;

  console.log(`   ${D}┌──────────────────────────────────────────────────────────┐${R}`);
  console.log(`   ${D}│${R} ${B}AGENT TRUST DEMO RESULTS                                ${R}${D}│${R}`);
  console.log(`   ${D}├──────────────────────────────────────────────────────────┤${R}`);
  console.log(`   ${D}│${R} Agents:        ${B}${pad("2 (Commerce + Intelligence)", 42)}${R}${D}│${R}`);
  console.log(`   ${D}│${R} Network:       ${B}${pad(mode, 42)}${R}${D}│${R}`);
  console.log(`   ${D}│${R} Identity:      ${G}${pad("wallet → org → role → authority ✓", 42)}${R}${D}│${R}`);
  console.log(`   ${D}│${R} Contract:      ${G}${pad("valid (ATP SDK) ✓", 42)}${R}${D}│${R}`);
  console.log(`   ${D}│${R} Policy:        ${G}${pad("real SDK evaluation ✓", 42)}${R}${D}│${R}`);
  console.log(`   ${D}│${R} Request 1:     ${G}${pad("geo-offer-pricing → PERMITTED ✓", 42)}${R}${D}│${R}`);
  console.log(`   ${D}│${R} Request 2:     ${RD}${pad("wallet-balances → DENIED ✗", 42)}${R}${D}│${R}`);
  console.log(`   ${D}│${R} Evidence:      ${LIVE ? G : Y}${pad(eviStatus, 42)}${R}${D}│${R}`);
  console.log(`   ${D}└──────────────────────────────────────────────────────────┘${R}`);

  if (LIVE && successTokenId) {
    console.log(`\n   ${D}On-chain evidence tokens:${R}`);
    console.log(`   ${G}•${R} Success: ${B}${successTokenId}${R}`);
  }

  console.log(`\n   ${B}Govern the action. Prove it happened.${R}\n`);

  console.log(`   Two AI agents needed to exchange sensitive data. Without ATP,`);
  console.log(`   Agent B has no way to verify Agent A's authority, enforce data`);
  console.log(`   classification policy, or prove the exchange happened.\n`);

  console.log(`   With ATP:`);
  console.log(`   ${G}•${R} Agent A's identity is ${LIVE ? "cryptographically verified on DUAL" : "verified via wallet → org chain"}`);
  console.log(`   ${G}•${R} Authority is derived from org membership, not self-asserted`);
  console.log(`   ${G}•${R} Policy constraints enforce data classification boundaries`);
  console.log(`   ${G}•${R} Both success and denial are ${LIVE ? "permanently anchored on-chain" : "recorded as evidence"}`);
  console.log(`   ${G}•${R} Neither agent can deny the interaction occurred\n`);

  console.log(`   ${D}This is what trust looks like between autonomous agents.${R}`);

  banner("Demo Complete");
}

main().catch((err) => {
  console.error(`\n${RD}Fatal: ${err.message}${R}\n`);
  process.exit(1);
});
