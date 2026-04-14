/**
 * PostgreSQL Evidence Backend
 *
 * Persistent, queryable evidence storage for ATP deployments using PostgreSQL.
 * Designed for the USyd Procurement Agent pilot and general enterprise use.
 *
 * Key properties:
 *   - Append-only: INSERTs only, no UPDATE or DELETE on evidence rows
 *   - Hash-chained: each record stores the content hash of the previous
 *     record in the same contract stream for tamper detection
 *   - Idempotent: duplicate writes (same evidence_id) are silently ignored
 *   - MultiBackend-safe: designed to run inside Promise.allSettled()
 *
 * @packageDocumentation
 */

import { Pool, PoolConfig } from "pg";
import { createHash } from "crypto";
import type { EvidenceRecord } from "../types";
import type {
  EvidenceBackend,
  EvidenceQuery,
  EvidenceQueryResult,
} from "./backends";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface PostgresBackendConfig {
  /** An existing pg Pool instance. Takes precedence over other options. */
  pool?: Pool;
  /** Postgres connection string (e.g. process.env.DATABASE_URL). */
  connectionString?: string;
  /** Full pg PoolConfig if more control is needed. */
  poolConfig?: PoolConfig;
  /** Table name for evidence records. Default: "atp_evidence". */
  tableName?: string;
  /** Schema name. Default: "public". */
  schema?: string;
  /**
   * Enable per-contract hash chaining. Default: true.
   * When enabled, each record's prev_content_hash is set to the content hash
   * of the most recent record in the same contract stream.
   */
  enableChaining?: boolean;
}

// ---------------------------------------------------------------------------
// Schema SQL
// ---------------------------------------------------------------------------

const CREATE_TABLE_SQL = (schema: string, table: string) => `
  CREATE TABLE IF NOT EXISTS ${schema}.${table} (
    id                    BIGSERIAL PRIMARY KEY,
    evidence_id           VARCHAR(64) NOT NULL UNIQUE,
    execution_id          VARCHAR(128) NOT NULL,
    contract_id           VARCHAR(256) NOT NULL,
    authority             VARCHAR(256) NOT NULL,
    requesting_wallet     VARCHAR(256) NOT NULL,
    requesting_org        VARCHAR(256) NOT NULL,
    action                VARCHAR(128) NOT NULL,
    outcome               VARCHAR(64) NOT NULL,
    request_hash          VARCHAR(128),
    response_hash         VARCHAR(128),
    gateway_id            VARCHAR(128) NOT NULL,
    attestation_level     VARCHAR(16) NOT NULL,
    attestation_ref       TEXT,
    evidence_status       VARCHAR(16),
    content_hash          VARCHAR(128) NOT NULL,
    prev_content_hash     VARCHAR(128),
    evidenced_at          TIMESTAMPTZ NOT NULL,
    record_data           JSONB NOT NULL,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_${table}_execution_id
    ON ${schema}.${table} (execution_id);
  CREATE INDEX IF NOT EXISTS idx_${table}_contract_id
    ON ${schema}.${table} (contract_id);
  CREATE INDEX IF NOT EXISTS idx_${table}_requesting_wallet
    ON ${schema}.${table} (requesting_wallet);
  CREATE INDEX IF NOT EXISTS idx_${table}_action
    ON ${schema}.${table} (action);
  CREATE INDEX IF NOT EXISTS idx_${table}_outcome
    ON ${schema}.${table} (outcome);
  CREATE INDEX IF NOT EXISTS idx_${table}_evidence_status
    ON ${schema}.${table} (evidence_status);
  CREATE INDEX IF NOT EXISTS idx_${table}_evidenced_at
    ON ${schema}.${table} (evidenced_at);

  -- Append-only enforcement (run manually with your application role):
  -- REVOKE UPDATE, DELETE ON ${schema}.${table} FROM atp_app_role;
`;

// ---------------------------------------------------------------------------
// Canonical JSON (matches sdk/ts/src/evidence/recorder.ts exactly)
// ---------------------------------------------------------------------------

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

function sha256(input: string): string {
  return `sha256:${createHash("sha256").update(input).digest("hex")}`;
}

// ---------------------------------------------------------------------------
// PostgresBackend
// ---------------------------------------------------------------------------

/**
 * PostgreSQL evidence backend for ATP.
 *
 * @example
 * ```typescript
 * import { PostgresBackend } from "@atp-protocol/sdk/evidence/postgres-backend";
 *
 * const backend = new PostgresBackend({
 *   connectionString: process.env.DATABASE_URL,
 * });
 *
 * await backend.store(evidenceRecord);
 *
 * const result = await backend.verify("evi_abc123def");
 * // { verified: true, attestation_ref: "pg:evi_abc123def", backend: "postgres", verified_at: "..." }
 * ```
 */
export class PostgresBackend implements EvidenceBackend {
  readonly name = "postgres";

  private pool: Pool;
  private tableName: string;
  private schema: string;
  private enableChaining: boolean;
  private initialised = false;

  constructor(config: PostgresBackendConfig) {
    if (config.pool) {
      this.pool = config.pool;
    } else if (config.connectionString) {
      this.pool = new Pool({ connectionString: config.connectionString });
    } else if (config.poolConfig) {
      this.pool = new Pool(config.poolConfig);
    } else {
      throw new Error(
        "PostgresBackend requires one of: pool, connectionString, or poolConfig"
      );
    }

    this.tableName = config.tableName ?? "atp_evidence";
    this.schema = config.schema ?? "public";
    this.enableChaining = config.enableChaining ?? true;
  }

  /**
   * Ensure the evidence table and indexes exist.
   * Called lazily on first operation. Safe to call multiple times.
   */
  async ensureSchema(): Promise<void> {
    if (this.initialised) return;
    await this.pool.query(CREATE_TABLE_SQL(this.schema, this.tableName));
    this.initialised = true;
  }

  /**
   * Store an evidence record. Append-only and idempotent.
   *
   * If chaining is enabled and the record doesn't already have a
   * prev_content_hash, the backend fetches the most recent record
   * for the same contract_id and links to its content hash.
   *
   * Duplicate evidence_id writes are silently ignored (ON CONFLICT DO NOTHING).
   */
  async store(record: EvidenceRecord): Promise<void> {
    await this.ensureSchema();
    const fqTable = `${this.schema}.${this.tableName}`;

    // JSON round-trip the record so the stored form matches what get() returns.
    // This ensures the content hash is consistent after JSONB serialisation
    // (undefined → null, key ordering changes, etc.), matching the pattern
    // used by FileEvidenceBackend.
    const roundTripped = JSON.parse(JSON.stringify(record));
    const contentHash = sha256(canonicalJson(roundTripped));

    // Resolve chain link
    let prevContentHash: string | null = null;
    if (this.enableChaining) {
      const prev = await this.getLatestForContract(record.contract_id);
      prevContentHash = prev
        ? sha256(canonicalJson(prev))
        : null;
    }

    await this.pool.query(
      `INSERT INTO ${fqTable} (
        evidence_id, execution_id, contract_id, authority,
        requesting_wallet, requesting_org, action, outcome,
        request_hash, response_hash, gateway_id, attestation_level,
        attestation_ref, evidence_status, content_hash, prev_content_hash,
        evidenced_at, record_data
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18
      ) ON CONFLICT (evidence_id) DO NOTHING`,
      [
        roundTripped.evidence_id,
        roundTripped.execution_id,
        roundTripped.contract_id,
        roundTripped.authority,
        roundTripped.requesting_wallet,
        roundTripped.requesting_org,
        roundTripped.action,
        roundTripped.outcome,
        roundTripped.request_hash ?? null,
        roundTripped.response_hash ?? null,
        roundTripped.gateway_id,
        roundTripped.attestation_level,
        roundTripped.attestation_ref ?? null,
        roundTripped.evidence_status ?? "pending",
        contentHash,
        prevContentHash,
        roundTripped.timestamps.evidenced_at,
        JSON.stringify(roundTripped),
      ]
    );
  }

  /**
   * Retrieve a single evidence record by evidence_id.
   */
  async get(evidenceId: string): Promise<EvidenceRecord | null> {
    await this.ensureSchema();
    const fqTable = `${this.schema}.${this.tableName}`;
    const result = await this.pool.query(
      `SELECT record_data FROM ${fqTable} WHERE evidence_id = $1 LIMIT 1`,
      [evidenceId]
    );
    if (result.rows.length === 0) return null;
    return result.rows[0].record_data as EvidenceRecord;
  }

  /**
   * Query evidence records with flexible filtering.
   * All filters are ANDed. Returns paginated results.
   */
  async query(params: EvidenceQuery): Promise<EvidenceQueryResult> {
    await this.ensureSchema();
    const fqTable = `${this.schema}.${this.tableName}`;

    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (params.evidence_id) {
      conditions.push(`evidence_id = $${idx++}`);
      values.push(params.evidence_id);
    }
    if (params.execution_id) {
      conditions.push(`execution_id = $${idx++}`);
      values.push(params.execution_id);
    }
    if (params.contract_id) {
      conditions.push(`contract_id = $${idx++}`);
      values.push(params.contract_id);
    }
    if (params.requesting_wallet) {
      conditions.push(`requesting_wallet = $${idx++}`);
      values.push(params.requesting_wallet);
    }
    if (params.action) {
      conditions.push(`action = $${idx++}`);
      values.push(params.action);
    }
    if (params.outcome) {
      conditions.push(`outcome = $${idx++}`);
      values.push(params.outcome);
    }
    if (params.status) {
      conditions.push(`evidence_status = $${idx++}`);
      values.push(params.status);
    }
    if (params.after) {
      conditions.push(`evidenced_at >= $${idx++}`);
      values.push(params.after);
    }
    if (params.before) {
      conditions.push(`evidenced_at <= $${idx++}`);
      values.push(params.before);
    }

    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = params.limit ?? 100;

    // Count total matches
    const countResult = await this.pool.query(
      `SELECT COUNT(*) FROM ${fqTable} ${where}`,
      values
    );
    const total = parseInt(countResult.rows[0].count, 10);

    // Fetch page
    const dataResult = await this.pool.query(
      `SELECT record_data FROM ${fqTable} ${where}
       ORDER BY evidenced_at DESC
       LIMIT $${idx++}`,
      [...values, limit]
    );

    const records = dataResult.rows.map(
      (row: any) => row.record_data as EvidenceRecord
    );

    return {
      records,
      total,
      has_more: total > records.length,
    };
  }

  /**
   * Verify that an evidence record exists and its content hash is intact.
   * Recomputes the hash from the stored JSONB and compares to the indexed hash.
   */
  async verify(evidenceId: string): Promise<{
    verified: boolean;
    attestation_ref?: string;
    backend: string;
    verified_at: string;
  }> {
    await this.ensureSchema();
    const fqTable = `${this.schema}.${this.tableName}`;

    const result = await this.pool.query(
      `SELECT record_data, content_hash FROM ${fqTable}
       WHERE evidence_id = $1 LIMIT 1`,
      [evidenceId]
    );

    if (result.rows.length === 0) {
      return {
        verified: false,
        backend: this.name,
        verified_at: new Date().toISOString(),
      };
    }

    const row = result.rows[0];
    const record = row.record_data as EvidenceRecord;
    const storedHash = row.content_hash as string;
    const recomputedHash = sha256(canonicalJson(record));

    return {
      verified: recomputedHash === storedHash,
      attestation_ref: recomputedHash === storedHash
        ? `pg:${evidenceId}`
        : undefined,
      backend: this.name,
      verified_at: new Date().toISOString(),
    };
  }

  // -----------------------------------------------------------------------
  // Chain verification (bonus: not in EvidenceBackend interface)
  // -----------------------------------------------------------------------

  /**
   * Walk the hash chain for a contract stream and verify every link.
   * Detects content-hash tampering and chain breaks.
   */
  async verifyChain(contractId: string): Promise<ChainVerificationResult> {
    await this.ensureSchema();
    const fqTable = `${this.schema}.${this.tableName}`;

    const result = await this.pool.query(
      `SELECT record_data, content_hash, prev_content_hash
       FROM ${fqTable}
       WHERE contract_id = $1
       ORDER BY evidenced_at ASC`,
      [contractId]
    );

    if (result.rows.length === 0) {
      return { valid: true, length: 0, errors: [] };
    }

    const errors: ChainError[] = [];

    for (let i = 0; i < result.rows.length; i++) {
      const row = result.rows[i];
      const record = row.record_data as EvidenceRecord;
      const storedHash = row.content_hash as string;
      const storedPrev = row.prev_content_hash as string | null;

      // Verify content hash
      const recomputed = sha256(canonicalJson(record));
      if (recomputed !== storedHash) {
        errors.push({
          index: i,
          evidence_id: record.evidence_id,
          type: "content_hash_mismatch",
          message: "Stored content hash does not match recomputed hash",
        });
      }

      // Verify chain link
      if (i === 0) {
        if (storedPrev !== null) {
          errors.push({
            index: 0,
            evidence_id: record.evidence_id,
            type: "unexpected_predecessor",
            message: "First record has a prev_content_hash but no predecessor exists",
          });
        }
      } else {
        const expectedPrev = result.rows[i - 1].content_hash;
        if (storedPrev !== expectedPrev) {
          errors.push({
            index: i,
            evidence_id: record.evidence_id,
            type: "chain_break",
            message: "prev_content_hash does not match predecessor's content_hash",
          });
        }
      }
    }

    return {
      valid: errors.length === 0,
      length: result.rows.length,
      errors,
    };
  }

  // -----------------------------------------------------------------------
  // Admin helpers
  // -----------------------------------------------------------------------

  /** Count total evidence records, optionally filtered by contract_id. */
  async count(contractId?: string): Promise<number> {
    await this.ensureSchema();
    const fqTable = `${this.schema}.${this.tableName}`;
    const result = contractId
      ? await this.pool.query(
          `SELECT COUNT(*) FROM ${fqTable} WHERE contract_id = $1`,
          [contractId]
        )
      : await this.pool.query(`SELECT COUNT(*) FROM ${fqTable}`);
    return parseInt(result.rows[0].count, 10);
  }

  /** Gracefully close the connection pool. */
  async close(): Promise<void> {
    await this.pool.end();
  }

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  private async getLatestForContract(
    contractId: string
  ): Promise<EvidenceRecord | null> {
    const fqTable = `${this.schema}.${this.tableName}`;
    const result = await this.pool.query(
      `SELECT record_data FROM ${fqTable}
       WHERE contract_id = $1
       ORDER BY evidenced_at DESC
       LIMIT 1`,
      [contractId]
    );
    if (result.rows.length === 0) return null;
    return result.rows[0].record_data as EvidenceRecord;
  }
}

// ---------------------------------------------------------------------------
// Supporting types
// ---------------------------------------------------------------------------

export interface ChainVerificationResult {
  valid: boolean;
  length: number;
  errors: ChainError[];
}

export interface ChainError {
  index: number;
  evidence_id: string;
  type: "content_hash_mismatch" | "chain_break" | "unexpected_predecessor";
  message: string;
}
