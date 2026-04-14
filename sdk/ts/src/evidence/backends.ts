/**
 * Evidence Backends
 *
 * Pluggable storage and anchoring backends for ATP evidence records.
 * The protocol is backend-agnostic — evidence can be stored locally,
 * on external attestation services, or on any combination.
 *
 * @packageDocumentation
 */

import { createHash } from "crypto";
import { promises as fs } from "fs";
import { join } from "path";
import type { EvidenceRecord, EvidenceStatus } from "../types";

// ---------------------------------------------------------------------------
// Backend Interface
// ---------------------------------------------------------------------------

/**
 * Query parameters for searching evidence records.
 */
export interface EvidenceQuery {
  /** Filter by evidence ID. */
  evidence_id?: string;
  /** Filter by execution ID. */
  execution_id?: string;
  /** Filter by contract ID. */
  contract_id?: string;
  /** Filter by requesting wallet. */
  requesting_wallet?: string;
  /** Filter by action name. */
  action?: string;
  /** Filter by outcome. */
  outcome?: string;
  /** Filter by evidence status. */
  status?: EvidenceStatus;
  /** Return records created after this ISO timestamp. */
  after?: string;
  /** Return records created before this ISO timestamp. */
  before?: string;
  /** Maximum number of results. */
  limit?: number;
}

export interface EvidenceQueryResult {
  records: EvidenceRecord[];
  total: number;
  has_more: boolean;
}

/**
 * Evidence backend interface.
 *
 * Implement this to create a custom evidence storage backend.
 * The SDK ships with Memory, File, and Postgres backends.
 */
export interface EvidenceBackend {
  /** Backend name (e.g., "memory", "file", "dual"). */
  readonly name: string;

  /** Store an evidence record. */
  store(record: EvidenceRecord): Promise<void>;

  /** Retrieve an evidence record by ID. */
  get(evidenceId: string): Promise<EvidenceRecord | null>;

  /** Query evidence records. */
  query(params: EvidenceQuery): Promise<EvidenceQueryResult>;

  /**
   * Verify that an evidence record exists and is intact on this backend.
   * Returns the attestation reference if anchored.
   */
  verify(evidenceId: string): Promise<{
    verified: boolean;
    attestation_ref?: string;
    backend: string;
    verified_at: string;
  }>;
}

// ---------------------------------------------------------------------------
// Memory Backend (ephemeral — for testing and development)
// ---------------------------------------------------------------------------

/**
 * In-memory evidence backend.
 * Records are lost when the process exits. Useful for testing.
 */
export class MemoryEvidenceBackend implements EvidenceBackend {
  readonly name = "memory";
  private records = new Map<string, EvidenceRecord>();

  async store(record: EvidenceRecord): Promise<void> {
    this.records.set(record.evidence_id, { ...record });
  }

  async get(evidenceId: string): Promise<EvidenceRecord | null> {
    return this.records.get(evidenceId) ?? null;
  }

  async query(params: EvidenceQuery): Promise<EvidenceQueryResult> {
    let results = Array.from(this.records.values());
    results = applyFilters(results, params);
    const total = results.length;
    const limit = params.limit ?? 100;
    return {
      records: results.slice(0, limit),
      total,
      has_more: total > limit,
    };
  }

  async verify(evidenceId: string): Promise<{
    verified: boolean;
    attestation_ref?: string;
    backend: string;
    verified_at: string;
  }> {
    const record = this.records.get(evidenceId);
    return {
      verified: record !== undefined,
      attestation_ref: record ? `mem:${evidenceId}` : undefined,
      backend: this.name,
      verified_at: new Date().toISOString(),
    };
  }

  /** Get all stored records (convenience for testing). */
  all(): EvidenceRecord[] {
    return Array.from(this.records.values());
  }

  /** Clear all records (convenience for testing). */
  clear(): void {
    this.records.clear();
  }
}

// ---------------------------------------------------------------------------
// File Backend (persistent — zero dependencies)
// ---------------------------------------------------------------------------

/**
 * File-system evidence backend.
 * Each evidence record is stored as a JSON file in a directory.
 * Provides local persistence with no external dependencies.
 *
 * @example
 * ```typescript
 * import { FileEvidenceBackend } from "@atp-protocol/sdk/evidence";
 *
 * const backend = new FileEvidenceBackend("./evidence-store");
 * await backend.store(evidenceRecord);
 *
 * // Records are stored as: ./evidence-store/evi_abc123.json
 * const record = await backend.get("evi_abc123");
 * ```
 */
export class FileEvidenceBackend implements EvidenceBackend {
  readonly name = "file";
  private directory: string;
  private initialized = false;

  constructor(directory: string) {
    this.directory = directory;
  }

  private async ensureDir(): Promise<void> {
    if (!this.initialized) {
      await fs.mkdir(this.directory, { recursive: true });
      this.initialized = true;
    }
  }

  private filePath(evidenceId: string): string {
    // Sanitize evidence_id for safe filenames
    const safe = evidenceId.replace(/[^a-zA-Z0-9_-]/g, "_");
    return join(this.directory, `${safe}.json`);
  }

  async store(record: EvidenceRecord): Promise<void> {
    await this.ensureDir();

    // Serialize the record first, then hash the serialized form
    // This ensures hash verification works after JSON round-trip
    const serialized = JSON.stringify(record);
    const contentHash = sha256(serialized);

    const envelope = {
      _atp_version: "1.0.0",
      _content_hash: contentHash,
      _stored_at: new Date().toISOString(),
      record: JSON.parse(serialized), // Store the round-tripped version
    };

    await fs.writeFile(
      this.filePath(record.evidence_id),
      JSON.stringify(envelope, null, 2),
      "utf-8"
    );
  }

  async get(evidenceId: string): Promise<EvidenceRecord | null> {
    try {
      const raw = await fs.readFile(this.filePath(evidenceId), "utf-8");
      const envelope = JSON.parse(raw);
      return envelope.record as EvidenceRecord;
    } catch {
      return null;
    }
  }

  async query(params: EvidenceQuery): Promise<EvidenceQueryResult> {
    await this.ensureDir();

    const files = await fs.readdir(this.directory);
    const jsonFiles = files.filter((f) => f.endsWith(".json"));

    const records: EvidenceRecord[] = [];
    for (const file of jsonFiles) {
      try {
        const raw = await fs.readFile(join(this.directory, file), "utf-8");
        const envelope = JSON.parse(raw);
        records.push(envelope.record as EvidenceRecord);
      } catch {
        // Skip corrupt files
      }
    }

    const filtered = applyFilters(records, params);
    const total = filtered.length;
    const limit = params.limit ?? 100;

    return {
      records: filtered.slice(0, limit),
      total,
      has_more: total > limit,
    };
  }

  async verify(evidenceId: string): Promise<{
    verified: boolean;
    attestation_ref?: string;
    backend: string;
    verified_at: string;
  }> {
    try {
      const raw = await fs.readFile(this.filePath(evidenceId), "utf-8");
      const envelope = JSON.parse(raw);
      const record = envelope.record as EvidenceRecord;

      // Verify content hash integrity (use JSON.stringify to match store-time hash)
      const expectedHash = sha256(JSON.stringify(record));
      const hashValid = envelope._content_hash === expectedHash;

      return {
        verified: hashValid,
        attestation_ref: hashValid
          ? `file:${this.filePath(evidenceId)}`
          : undefined,
        backend: this.name,
        verified_at: new Date().toISOString(),
      };
    } catch {
      return {
        verified: false,
        backend: this.name,
        verified_at: new Date().toISOString(),
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Multi Backend (fan-out to multiple backends)
// ---------------------------------------------------------------------------

/**
 * Multi-backend that writes to multiple backends simultaneously.
 * Useful for local + external dual-write patterns.
 *
 * @example
 * ```typescript
 * import { MultiBackend, FileEvidenceBackend, PostgresBackend } from "@atp-protocol/sdk/evidence";
 *
 * const backend = new MultiBackend([
 *   new FileEvidenceBackend("./evidence"),
 *   new PostgresBackend({ connectionString: "...", schema: "evidence" }),
 * ]);
 *
 * // Writes to both file and Postgres
 * await backend.store(record);
 *
 * // Verify checks all backends
 * const result = await backend.verify("evi_abc123");
 * // result.verified === true if ANY backend verifies
 * ```
 */
export class MultiBackend implements EvidenceBackend {
  readonly name: string;
  private backends: EvidenceBackend[];

  constructor(backends: EvidenceBackend[]) {
    if (backends.length === 0) {
      throw new Error("MultiBackend requires at least one backend");
    }
    this.backends = backends;
    this.name = `multi(${backends.map((b) => b.name).join("+")})`;
  }

  async store(record: EvidenceRecord): Promise<void> {
    // Write to all backends in parallel
    const results = await Promise.allSettled(
      this.backends.map((b) => b.store(record))
    );

    // If all failed, throw
    const failures = results.filter(
      (r): r is PromiseRejectedResult => r.status === "rejected"
    );
    if (failures.length === this.backends.length) {
      throw new Error(
        `All backends failed: ${failures.map((f) => f.reason).join("; ")}`
      );
    }
  }

  async get(evidenceId: string): Promise<EvidenceRecord | null> {
    // Try each backend in order, return first match
    for (const backend of this.backends) {
      const record = await backend.get(evidenceId);
      if (record) return record;
    }
    return null;
  }

  async query(params: EvidenceQuery): Promise<EvidenceQueryResult> {
    // Query the first backend (primary)
    return this.backends[0].query(params);
  }

  async verify(evidenceId: string): Promise<{
    verified: boolean;
    attestation_ref?: string;
    backend: string;
    verified_at: string;
  }> {
    // Check all backends — verified if ANY verifies
    const results = await Promise.all(
      this.backends.map((b) => b.verify(evidenceId))
    );

    const verified = results.find((r) => r.verified);
    if (verified) return verified;

    return {
      verified: false,
      backend: this.name,
      verified_at: new Date().toISOString(),
    };
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function applyFilters(
  records: EvidenceRecord[],
  params: EvidenceQuery
): EvidenceRecord[] {
  return records.filter((r) => {
    if (params.evidence_id && r.evidence_id !== params.evidence_id)
      return false;
    if (params.execution_id && r.execution_id !== params.execution_id)
      return false;
    if (params.contract_id && r.contract_id !== params.contract_id)
      return false;
    if (
      params.requesting_wallet &&
      r.requesting_wallet !== params.requesting_wallet
    )
      return false;
    if (params.action && r.action !== params.action) return false;
    if (params.outcome && r.outcome !== params.outcome) return false;
    if (params.status && r.evidence_status !== params.status) return false;
    if (params.after && r.timestamps.evidenced_at < params.after) return false;
    if (params.before && r.timestamps.evidenced_at > params.before)
      return false;
    return true;
  });
}

function sha256(input: string): string {
  return `sha256:${createHash("sha256").update(input).digest("hex")}`;
}

function canonicalJson(obj: unknown): string {
  if (obj === null || obj === undefined) return "null";
  if (typeof obj === "number") {
    if (Number.isNaN(obj)) return '"__NaN__"';
    if (obj === Infinity) return '"__Infinity__"';
    if (obj === -Infinity) return '"__-Infinity__"';
    if (Object.is(obj, -0)) return '"__-0__"';
    return JSON.stringify(obj);
  }
  if (typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) {
    return `[${obj.map(canonicalJson).join(",")}]`;
  }
  const sorted = Object.keys(obj as Record<string, unknown>).sort();
  const pairs = sorted.map(
    (key) =>
      `${JSON.stringify(key)}:${canonicalJson((obj as Record<string, unknown>)[key])}`
  );
  return `{${pairs.join(",")}}`;
}
