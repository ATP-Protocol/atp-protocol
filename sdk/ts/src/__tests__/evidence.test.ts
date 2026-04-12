/**
 * Evidence Module Tests
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  EvidenceBuilder,
  buildEvidence,
  verifyEvidence,
  hashEvidence,
  MemoryEvidenceBackend,
  FileEvidenceBackend,
  MultiBackend,
} from "../evidence";
import type { EvidenceBuildInput } from "../evidence";
import { tmpdir } from "os";
import { join } from "path";
import { mkdtemp, rm } from "fs/promises";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeInput(overrides: Partial<EvidenceBuildInput> = {}): EvidenceBuildInput {
  return {
    contract_id: "ctr_test",
    execution_id: "exe_test123",
    authority: "org.test.agent",
    requesting_wallet: "0xTestWallet",
    requesting_org: "org_test",
    action: "send-email",
    scope_snapshot: { recipient: "user@example.com" },
    outcome: "outcome:success",
    request_payload: { to: "user@example.com", subject: "Test" },
    response_payload: { status: 200, message_id: "msg_123" },
    attestation_level: "full",
    gateway_id: "gw_test",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// buildEvidence
// ---------------------------------------------------------------------------

describe("buildEvidence", () => {
  it("creates a valid evidence record", () => {
    const record = buildEvidence(makeInput());

    expect(record.evidence_id).toMatch(/^evi_[a-z0-9]+$/);
    expect(record.contract_id).toBe("ctr_test");
    expect(record.authority).toBe("org.test.agent");
    expect(record.action).toBe("send-email");
    expect(record.outcome).toBe("outcome:success");
    expect(record.request_hash).toMatch(/^sha256:/);
    expect(record.response_hash).toMatch(/^sha256:/);
    expect(record.timestamps.evidenced_at).toBeTruthy();
    expect(record.evidence_status).toBe("pending");
  });

  it("produces deterministic hashes for same input", () => {
    const input = makeInput();
    const a = buildEvidence(input);
    const b = buildEvidence(input);
    expect(a.request_hash).toBe(b.request_hash);
    expect(a.response_hash).toBe(b.response_hash);
  });

  it("omits response_hash when no response payload", () => {
    const record = buildEvidence(makeInput({ response_payload: undefined }));
    expect(record.response_hash).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// EvidenceBuilder (fluent API)
// ---------------------------------------------------------------------------

describe("EvidenceBuilder", () => {
  it("builds a record via fluent API", () => {
    const record = new EvidenceBuilder("ctr_1", "exe_1", "transfer")
      .authority("org.bank.agent")
      .wallet("0xAgent", "org_bank")
      .scope({ amount: 100 })
      .outcome("outcome:success")
      .request({ amount: 100, to: "0xRecipient" })
      .response({ tx_hash: "0xabc" })
      .attestation("full", "gw_main")
      .build();

    expect(record.contract_id).toBe("ctr_1");
    expect(record.action).toBe("transfer");
    expect(record.authority).toBe("org.bank.agent");
    expect(record.requesting_wallet).toBe("0xAgent");
    expect(record.outcome).toBe("outcome:success");
    expect(record.request_hash).toMatch(/^sha256:/);
  });

  it("throws when required fields are missing", () => {
    expect(() => {
      new EvidenceBuilder("ctr_1", "exe_1", "transfer").build();
    }).toThrow(/missing required field/);
  });

  it("builds and stores to backend", async () => {
    const backend = new MemoryEvidenceBackend();

    const record = await new EvidenceBuilder("ctr_1", "exe_1", "transfer")
      .authority("org.bank.agent")
      .wallet("0xAgent", "org_bank")
      .outcome("outcome:success")
      .request({ amount: 100 })
      .attestation("full", "gw_main")
      .buildAndStore(backend);

    const stored = await backend.get(record.evidence_id);
    expect(stored).toBeTruthy();
    expect(stored!.evidence_id).toBe(record.evidence_id);
  });
});

// ---------------------------------------------------------------------------
// verifyEvidence
// ---------------------------------------------------------------------------

describe("verifyEvidence", () => {
  it("passes for valid record", () => {
    const record = buildEvidence(makeInput());
    const result = verifyEvidence(record);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("verifies request hash against original payload", () => {
    const input = makeInput();
    const record = buildEvidence(input);

    // Correct payload
    const valid = verifyEvidence(record, input.request_payload);
    expect(valid.checks.request_hash_valid).toBe(true);

    // Tampered payload
    const tampered = verifyEvidence(record, { to: "hacker@evil.com" });
    expect(tampered.checks.request_hash_valid).toBe(false);
    expect(tampered.valid).toBe(false);
  });

  it("verifies response hash against original payload", () => {
    const input = makeInput();
    const record = buildEvidence(input);

    const valid = verifyEvidence(record, undefined, input.response_payload);
    expect(valid.checks.response_hash_valid).toBe(true);
  });

  it("detects out-of-order timestamps", () => {
    const record = buildEvidence(makeInput({
      timestamps: {
        requested_at: "2026-04-12T10:00:00Z",
        authorized_at: "2026-04-12T09:00:00Z", // Before requested_at!
      },
    }));

    const result = verifyEvidence(record);
    expect(result.checks.timestamps_ordered).toBe(false);
    expect(result.valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// hashEvidence
// ---------------------------------------------------------------------------

describe("hashEvidence", () => {
  it("returns deterministic sha256 hash", () => {
    const record = buildEvidence(makeInput());
    const hash1 = hashEvidence(record);
    const hash2 = hashEvidence(record);
    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("changes when record changes", () => {
    const record = buildEvidence(makeInput());
    const hash1 = hashEvidence(record);

    const modified = { ...record, outcome: "outcome:failure" as const };
    const hash2 = hashEvidence(modified);
    expect(hash1).not.toBe(hash2);
  });
});

// ---------------------------------------------------------------------------
// MemoryEvidenceBackend
// ---------------------------------------------------------------------------

describe("MemoryEvidenceBackend", () => {
  let backend: MemoryEvidenceBackend;

  beforeEach(() => {
    backend = new MemoryEvidenceBackend();
  });

  it("stores and retrieves records", async () => {
    const record = buildEvidence(makeInput());
    await backend.store(record);

    const retrieved = await backend.get(record.evidence_id);
    expect(retrieved).toBeTruthy();
    expect(retrieved!.evidence_id).toBe(record.evidence_id);
  });

  it("returns null for missing records", async () => {
    const result = await backend.get("evi_nonexistent");
    expect(result).toBeNull();
  });

  it("queries by contract_id", async () => {
    await backend.store(buildEvidence(makeInput({ contract_id: "ctr_a" })));
    await backend.store(buildEvidence(makeInput({ contract_id: "ctr_b" })));

    const results = await backend.query({ contract_id: "ctr_a" });
    expect(results.records).toHaveLength(1);
    expect(results.records[0].contract_id).toBe("ctr_a");
  });

  it("queries by action", async () => {
    await backend.store(buildEvidence(makeInput({ action: "send-email" })));
    await backend.store(buildEvidence(makeInput({ action: "read-data" })));

    const results = await backend.query({ action: "read-data" });
    expect(results.records).toHaveLength(1);
  });

  it("verifies stored records", async () => {
    const record = buildEvidence(makeInput());
    await backend.store(record);

    const verification = await backend.verify(record.evidence_id);
    expect(verification.verified).toBe(true);
    expect(verification.backend).toBe("memory");
  });
});

// ---------------------------------------------------------------------------
// FileEvidenceBackend
// ---------------------------------------------------------------------------

describe("FileEvidenceBackend", () => {
  let dir: string;
  let backend: FileEvidenceBackend;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "atp-evidence-"));
    backend = new FileEvidenceBackend(dir);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  });

  it("stores and retrieves records from disk", async () => {
    const record = buildEvidence(makeInput());
    await backend.store(record);

    const retrieved = await backend.get(record.evidence_id);
    expect(retrieved).toBeTruthy();
    expect(retrieved!.evidence_id).toBe(record.evidence_id);
    expect(retrieved!.request_hash).toBe(record.request_hash);
  });

  it("returns null for missing records", async () => {
    const result = await backend.get("evi_missing");
    expect(result).toBeNull();
  });

  it("verifies integrity of stored records", async () => {
    const record = buildEvidence(makeInput());
    await backend.store(record);

    const verification = await backend.verify(record.evidence_id);
    expect(verification.verified).toBe(true);
    expect(verification.backend).toBe("file");
    expect(verification.attestation_ref).toContain("file:");
  });

  it("queries across stored records", async () => {
    await backend.store(buildEvidence(makeInput({ action: "send-email" })));
    await backend.store(buildEvidence(makeInput({ action: "read-data" })));

    const results = await backend.query({ action: "send-email" });
    expect(results.records).toHaveLength(1);
    expect(results.total).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// MultiBackend
// ---------------------------------------------------------------------------

describe("MultiBackend", () => {
  it("writes to all backends", async () => {
    const mem1 = new MemoryEvidenceBackend();
    const mem2 = new MemoryEvidenceBackend();
    const multi = new MultiBackend([mem1, mem2]);

    const record = buildEvidence(makeInput());
    await multi.store(record);

    expect(await mem1.get(record.evidence_id)).toBeTruthy();
    expect(await mem2.get(record.evidence_id)).toBeTruthy();
  });

  it("reads from first available backend", async () => {
    const mem1 = new MemoryEvidenceBackend();
    const mem2 = new MemoryEvidenceBackend();
    const multi = new MultiBackend([mem1, mem2]);

    const record = buildEvidence(makeInput());
    await mem2.store(record); // Only in second backend

    const result = await multi.get(record.evidence_id);
    expect(result).toBeTruthy();
  });

  it("verifies across backends", async () => {
    const mem1 = new MemoryEvidenceBackend();
    const mem2 = new MemoryEvidenceBackend();
    const multi = new MultiBackend([mem1, mem2]);

    const record = buildEvidence(makeInput());
    await mem1.store(record);

    const result = await multi.verify(record.evidence_id);
    expect(result.verified).toBe(true);
  });

  it("throws when all backends fail", async () => {
    const failing = {
      name: "failing",
      store: async () => { throw new Error("fail"); },
      get: async () => null,
      query: async () => ({ records: [], total: 0, has_more: false }),
      verify: async () => ({ verified: false, backend: "failing", verified_at: "" }),
    };
    const multi = new MultiBackend([failing]);

    const record = buildEvidence(makeInput());
    await expect(multi.store(record)).rejects.toThrow("All backends failed");
  });

  it("requires at least one backend", () => {
    expect(() => new MultiBackend([])).toThrow("at least one backend");
  });
});
