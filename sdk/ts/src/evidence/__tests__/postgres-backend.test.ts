/**
 * Tests for PostgresBackend
 *
 * Uses pg-mem for fast, isolated tests with no external database dependency.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { newDb } from "pg-mem";
import type { EvidenceRecord } from "../../types";
import { buildEvidence } from "../recorder";
import { PostgresBackend } from "../postgres-backend";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let counter = 0;

function makeRecord(overrides: Partial<Record<string, unknown>> = {}): EvidenceRecord {
  counter++;
  return buildEvidence({
    contract_id: (overrides.contract_id as string) ?? "usyd.procurement.raise_po.v1",
    execution_id: `exe_test_${counter}_${Date.now()}`,
    authority: "usyd.edu.au",
    requesting_wallet: "0x2A976Bfa74Dd3212D93067708A32e3CE2bA58110",
    requesting_org: "69b935b4187e903f826bbe71",
    action: (overrides.action as string) ?? "raise_po",
    scope_snapshot: { vendor: "Officeworks", total: 1200, cost_centre: "4021" },
    outcome: (overrides.outcome as any) ?? "outcome:success",
    request_payload: { vendor: "Officeworks", total: 1200 },
    response_payload: { po_number: `PO-${counter}` },
    attestation_level: "full",
    gateway_id: "gw_test_001",
    credential_path: {
      provider: "secrets-manager",
      scope_used: ["peoplesoft.po.write"],
      injection_method: "bearer_token",
    },
    policy_snapshot: {
      policies_evaluated: 4,
      constraints_applied: [],
    },
  });
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

describe("PostgresBackend", () => {
  let backend: PostgresBackend;

  beforeAll(async () => {
    const db = newDb();
    const PgPool = db.adapters.createPg().Pool;
    const pool = new PgPool();

    backend = new PostgresBackend({
      pool: pool as any,
      tableName: "atp_evidence",
      schema: "public",
      enableChaining: true,
    });

    await backend.ensureSchema();
  });

  afterAll(async () => {
    await backend.close();
  });

  // -------------------------------------------------------------------------
  // store + get
  // -------------------------------------------------------------------------

  describe("store and get", () => {
    it("stores and retrieves a record by evidence_id", async () => {
      const record = makeRecord();
      await backend.store(record);

      const retrieved = await backend.get(record.evidence_id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.evidence_id).toBe(record.evidence_id);
      expect(retrieved!.contract_id).toBe("usyd.procurement.raise_po.v1");
      expect(retrieved!.outcome).toBe("outcome:success");
      expect(retrieved!.requesting_wallet).toBe("0x2A976Bfa74Dd3212D93067708A32e3CE2bA58110");
    });

    it("returns null for a non-existent evidence_id", async () => {
      const result = await backend.get("evi_doesnotexist");
      expect(result).toBeNull();
    });

    it("silently ignores duplicate evidence_id writes (idempotent)", async () => {
      const record = makeRecord();
      await backend.store(record);
      await backend.store(record); // should not throw

      const results = await backend.query({ evidence_id: record.evidence_id });
      expect(results.records.length).toBe(1);
    });

    it("preserves nested structures (approval, policy_snapshot, timestamps)", async () => {
      const record = makeRecord();
      await backend.store(record);

      const retrieved = await backend.get(record.evidence_id);
      expect(retrieved!.timestamps).toBeDefined();
      expect(retrieved!.timestamps.evidenced_at).toBeDefined();
      expect(retrieved!.policy_snapshot.policies_evaluated).toBe(4);
      expect(retrieved!.credential_path.provider).toBe("secrets-manager");
    });
  });

  // -------------------------------------------------------------------------
  // query
  // -------------------------------------------------------------------------

  describe("query", () => {
    it("filters by contract_id", async () => {
      const cid = `test.filter.contract.${Date.now()}`;
      await backend.store(makeRecord({ contract_id: cid }));
      await backend.store(makeRecord({ contract_id: cid }));
      await backend.store(makeRecord({ contract_id: "other.contract" }));

      const result = await backend.query({ contract_id: cid });
      expect(result.records.length).toBe(2);
      expect(result.total).toBe(2);
      expect(result.records.every((r) => r.contract_id === cid)).toBe(true);
    });

    it("filters by outcome", async () => {
      const cid = `test.filter.outcome.${Date.now()}`;
      await backend.store(makeRecord({ contract_id: cid, outcome: "outcome:success" }));
      await backend.store(makeRecord({ contract_id: cid, outcome: "outcome:denied" }));

      const result = await backend.query({ contract_id: cid, outcome: "outcome:denied" });
      expect(result.records.length).toBe(1);
      expect(result.records[0].outcome).toBe("outcome:denied");
    });

    it("filters by action", async () => {
      const cid = `test.filter.action.${Date.now()}`;
      await backend.store(makeRecord({ contract_id: cid, action: "raise_po" }));
      await backend.store(makeRecord({ contract_id: cid, action: "check_budget" }));

      const result = await backend.query({ contract_id: cid, action: "check_budget" });
      expect(result.records.length).toBe(1);
    });

    it("respects limit", async () => {
      const cid = `test.pagination.${Date.now()}`;
      for (let i = 0; i < 5; i++) {
        await backend.store(makeRecord({ contract_id: cid }));
      }

      const result = await backend.query({ contract_id: cid, limit: 2 });
      expect(result.records.length).toBe(2);
      expect(result.total).toBe(5);
      expect(result.has_more).toBe(true);
    });

    it("returns empty result for no matches", async () => {
      const result = await backend.query({ contract_id: "nonexistent.contract.v1" });
      expect(result.records).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.has_more).toBe(false);
    });

    it("returns EvidenceQueryResult shape", async () => {
      const result = await backend.query({});
      expect(result).toHaveProperty("records");
      expect(result).toHaveProperty("total");
      expect(result).toHaveProperty("has_more");
      expect(Array.isArray(result.records)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // verify
  // -------------------------------------------------------------------------

  describe("verify", () => {
    it("returns verified: true for an intact record", async () => {
      const record = makeRecord();
      await backend.store(record);

      const result = await backend.verify(record.evidence_id);
      expect(result.verified).toBe(true);
      expect(result.backend).toBe("postgres");
      expect(result.attestation_ref).toBe(`pg:${record.evidence_id}`);
      expect(result.verified_at).toBeDefined();
    });

    it("returns verified: false for non-existent record", async () => {
      const result = await backend.verify("evi_nonexistent999");
      expect(result.verified).toBe(false);
      expect(result.backend).toBe("postgres");
    });

    it("returns the correct verify response shape", async () => {
      const record = makeRecord();
      await backend.store(record);

      const result = await backend.verify(record.evidence_id);
      expect(result).toHaveProperty("verified");
      expect(result).toHaveProperty("backend");
      expect(result).toHaveProperty("verified_at");
    });
  });

  // -------------------------------------------------------------------------
  // hash chaining
  // -------------------------------------------------------------------------

  describe("hash chaining", () => {
    it("verifyChain returns valid for a correct chain", async () => {
      const cid = `test.chain.valid.${Date.now()}`;
      await backend.store(makeRecord({ contract_id: cid }));
      await backend.store(makeRecord({ contract_id: cid }));
      await backend.store(makeRecord({ contract_id: cid }));

      const result = await backend.verifyChain(cid);
      expect(result.valid).toBe(true);
      expect(result.length).toBe(3);
      expect(result.errors).toEqual([]);
    });

    it("verifyChain returns valid for an empty contract", async () => {
      const result = await backend.verifyChain("nonexistent.contract.v999");
      expect(result.valid).toBe(true);
      expect(result.length).toBe(0);
    });

    it("first record in chain has null prev_content_hash", async () => {
      const cid = `test.chain.first.${Date.now()}`;
      await backend.store(makeRecord({ contract_id: cid }));

      // Verify the chain — first record should not flag an error
      const result = await backend.verifyChain(cid);
      expect(result.valid).toBe(true);
      expect(result.length).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // count
  // -------------------------------------------------------------------------

  describe("count", () => {
    it("counts all records", async () => {
      const total = await backend.count();
      expect(total).toBeGreaterThan(0);
    });

    it("counts records for a specific contract", async () => {
      const cid = `test.count.${Date.now()}`;
      await backend.store(makeRecord({ contract_id: cid }));
      await backend.store(makeRecord({ contract_id: cid }));

      const count = await backend.count(cid);
      expect(count).toBe(2);
    });
  });

  // -------------------------------------------------------------------------
  // name property (EvidenceBackend interface)
  // -------------------------------------------------------------------------

  describe("interface compliance", () => {
    it("has a name property equal to 'postgres'", () => {
      expect(backend.name).toBe("postgres");
    });
  });
});
