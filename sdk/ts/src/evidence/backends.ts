/**
 * Evidence Backends
 *
 * Pluggable storage and anchoring backends for ATP evidence records.
 * The protocol is backend-agnostic — evidence can be stored locally,
 * on the DUAL network, on IPFS, or on any combination.
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
 * The SDK ships with Memory, File, and DUAL backends.
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
// DUAL Backend (on-chain anchoring via DUAL network)
// ---------------------------------------------------------------------------

/**
 * Configuration for the DUAL evidence backend.
 */
export interface DUALBackendConfig {
  /** DUAL API endpoint (e.g., "https://api.dual.foundation"). */
  endpoint: string;
  /** API key for authentication. */
  apiKey: string;
  /** Evidence template ID on the DUAL network. */
  templateId: string;
  /** Network ("mainnet" | "testnet"). */
  network?: "mainnet" | "testnet";
}

/**
 * DUAL network evidence backend.
 * Mints evidence records as immutable tokens on the DUAL blockchain.
 *
 * @example
 * ```typescript
 * import { DUALEvidenceBackend } from "@atp-protocol/sdk/evidence";
 *
 * const backend = new DUALEvidenceBackend({
 *   endpoint: "https://api.dual.foundation",
 *   apiKey: process.env.DUAL_API_KEY!,
 *   templateId: "69db28bf77b40528a5b4851f", // io.atp.evidence.v1
 * });
 *
 * // This mints a real token on-chain
 * await backend.store(evidenceRecord);
 * ```
 */
export class DUALEvidenceBackend implements EvidenceBackend {
  readonly name = "dual";
  private config: Required<DUALBackendConfig>;
  private objectIdMap = new Map<string, string>(); // evidence_id → DUAL object_id

  constructor(config: DUALBackendConfig) {
    this.config = {
      network: "testnet",
      ...config,
    };
  }

  private async dualFetch<T>(
    path: string,
    opts: RequestInit = {}
  ): Promise<T> {
    const res = await fetch(`${this.config.endpoint}${path}`, {
      ...opts,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
        ...(opts.headers as Record<string, string> || {}),
      },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`DUAL ${res.status}: ${body}`);
    }
    return res.json() as Promise<T>;
  }

  async store(record: EvidenceRecord): Promise<void> {
    // Step 1: Mint a new evidence token
    const mintResult = await this.dualFetch<any>("/actions", {
      method: "POST",
      body: JSON.stringify({
        mint: { template_id: this.config.templateId, num: 1 },
      }),
    });

    const objectId =
      mintResult.data?.steps?.[0]?.output?.ids?.[0] ??
      mintResult.data?.object_id;

    if (!objectId) {
      throw new Error("DUAL mint did not return an object ID");
    }

    // Step 2: Write evidence data to the token
    await this.dualFetch("/actions", {
      method: "POST",
      body: JSON.stringify({
        update: {
          id: objectId,
          data: {
            custom: {
              evidence_id: record.evidence_id,
              execution_id: record.execution_id,
              contract_id: record.contract_id,
              action: record.action,
              wallet_address: record.requesting_wallet,
              authority: record.authority,
              policy_result:
                record.outcome === "outcome:denied" ? "denied" : "pass",
              approval_status: record.approval
                ? record.approval.decision
                : "not_required",
              outcome: record.outcome.replace("outcome:", ""),
              scope_hash: record.request_hash,
              timestamp: record.timestamps.evidenced_at,
              gateway_version: "1.0.0-draft.2",
            },
          },
        },
      }),
    });

    // Track the mapping
    this.objectIdMap.set(record.evidence_id, objectId);
  }

  async get(evidenceId: string): Promise<EvidenceRecord | null> {
    const objectId = this.objectIdMap.get(evidenceId);
    if (!objectId) return null;

    try {
      const result = await this.dualFetch<any>(`/objects/${objectId}`);
      const custom = result.data?.custom ?? {};

      // Reconstruct a partial evidence record from on-chain data
      return {
        evidence_id: custom.evidence_id,
        execution_id: custom.execution_id ?? "",
        contract_id: custom.contract_id,
        authority: custom.authority,
        requesting_wallet: custom.wallet_address,
        requesting_org: "",
        action: custom.action,
        scope_snapshot: {},
        credential_path: {
          provider: "none",
          scope_used: [],
          injection_method: "custom",
        },
        outcome: `outcome:${custom.outcome}` as any,
        request_hash: custom.scope_hash,
        policy_snapshot: {
          policies_evaluated: 0,
          constraints_applied: [],
        },
        timestamps: {
          requested_at: custom.timestamp,
          evidenced_at: custom.timestamp,
        },
        gateway_id: "",
        attestation_level: "full",
        attestation_ref: `dual:${objectId}`,
        evidence_status: "confirmed",
      };
    } catch {
      return null;
    }
  }

  async query(_params: EvidenceQuery): Promise<EvidenceQueryResult> {
    // Query DUAL objects by template
    const result = await this.dualFetch<any>(
      `/objects?template_id=${this.config.templateId}&limit=${_params.limit ?? 100}`
    );

    const objects = result.data?.objects ?? [];
    const records: EvidenceRecord[] = objects.map((obj: any) => {
      const c = obj.custom ?? {};
      return {
        evidence_id: c.evidence_id ?? obj.id,
        execution_id: c.execution_id ?? "",
        contract_id: c.contract_id ?? "",
        authority: c.authority ?? "",
        requesting_wallet: c.wallet_address ?? "",
        requesting_org: obj.org_id ?? "",
        action: c.action ?? "",
        scope_snapshot: {},
        credential_path: {
          provider: "none",
          scope_used: [],
          injection_method: "custom" as const,
        },
        outcome: `outcome:${c.outcome ?? "unknown"}` as any,
        request_hash: c.scope_hash ?? "",
        policy_snapshot: { policies_evaluated: 0, constraints_applied: [] },
        timestamps: {
          requested_at: c.timestamp ?? obj.when_created,
          evidenced_at: c.timestamp ?? obj.when_created,
        },
        gateway_id: "",
        attestation_level: "full" as const,
        attestation_ref: `dual:${obj.id}`,
        evidence_status: "confirmed" as const,
      };
    });

    return {
      records,
      total: records.length,
      has_more: !!result.data?.next,
    };
  }

  async verify(evidenceId: string): Promise<{
    verified: boolean;
    attestation_ref?: string;
    backend: string;
    verified_at: string;
  }> {
    const objectId = this.objectIdMap.get(evidenceId);
    if (!objectId) {
      return {
        verified: false,
        backend: this.name,
        verified_at: new Date().toISOString(),
      };
    }

    try {
      const result = await this.dualFetch<any>(`/objects/${objectId}`);
      const custom = result.data?.custom ?? {};

      return {
        verified: custom.evidence_id === evidenceId,
        attestation_ref: `dual:${objectId}`,
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
 * Useful for local + on-chain dual-write patterns.
 *
 * @example
 * ```typescript
 * import { MultiBackend, FileEvidenceBackend, DUALEvidenceBackend } from "@atp-protocol/sdk/evidence";
 *
 * const backend = new MultiBackend([
 *   new FileEvidenceBackend("./evidence"),
 *   new DUALEvidenceBackend({ endpoint: "...", apiKey: "...", templateId: "..." }),
 * ]);
 *
 * // Writes to both file and DUAL
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
