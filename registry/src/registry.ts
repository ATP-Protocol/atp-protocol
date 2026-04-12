/**
 * Contract Registry Implementation
 *
 * Publish, discover, and resolve ATP governance contracts.
 */

import { promises as fs } from "fs";
import { join } from "path";
import { createHash } from "crypto";
import { validateContract } from "@atp-protocol/sdk";
import type { ATPContract } from "@atp-protocol/sdk";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A contract entry in the registry.
 */
export interface ContractEntry {
  /** Fully qualified contract ID (e.g., "io.myorg.payment.v1"). */
  id: string;
  /** Semantic version. */
  version: string;
  /** The contract itself. */
  contract: ATPContract;
  /** Publisher metadata. */
  publisher: {
    org_id: string;
    wallet?: string;
    published_at: string;
  };
  /** Content hash of the contract for integrity verification. */
  content_hash: string;
  /** Human-readable description. */
  description?: string;
  /** Discovery tags. */
  tags?: string[];
  /** Whether this version is deprecated. */
  deprecated?: boolean;
  /** Deprecation message. */
  deprecation_message?: string;
}

/**
 * Query parameters for searching the registry.
 */
export interface RegistryQuery {
  /** Search by action name (e.g., "send-email"). */
  action?: string;
  /** Search by authority pattern (glob, e.g., "org.procurement.*"). */
  authority_pattern?: string;
  /** Search by tag. */
  tag?: string;
  /** Search by publisher org. */
  publisher_org?: string;
  /** Free-text search across ID, description, and tags. */
  text?: string;
  /** Include deprecated contracts. */
  include_deprecated?: boolean;
  /** Maximum results. */
  limit?: number;
}

export interface RegistryQueryResult {
  entries: ContractEntry[];
  total: number;
  has_more: boolean;
}

/**
 * Registry backend interface.
 */
export interface RegistryBackend {
  readonly name: string;

  /** Publish a contract entry. */
  publish(entry: ContractEntry): Promise<void>;

  /** Resolve a contract by ID and optional version. */
  resolve(id: string, version?: string): Promise<ContractEntry | null>;

  /** Search the registry. */
  search(query: RegistryQuery): Promise<RegistryQueryResult>;

  /** List all versions of a contract. */
  versions(id: string): Promise<string[]>;

  /** Deprecate a specific version. */
  deprecate(id: string, version: string, message: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Contract Registry
// ---------------------------------------------------------------------------

/**
 * ATP Contract Registry.
 *
 * @example
 * ```typescript
 * import { ContractRegistry, LocalRegistryBackend } from "@atp-protocol/registry";
 *
 * const registry = new ContractRegistry(
 *   new LocalRegistryBackend("./contracts")
 * );
 *
 * // Publish
 * await registry.publish("io.myorg.payment.v1", myContract, {
 *   org_id: "org_123",
 *   description: "Payment approval contract",
 *   tags: ["payment", "approval"],
 * });
 *
 * // Discover
 * const results = await registry.search({ action: "send-payment" });
 *
 * // Resolve
 * const contract = await registry.resolve("io.myorg.payment.v1");
 * ```
 */
export class ContractRegistry {
  private backend: RegistryBackend;

  constructor(backend: RegistryBackend) {
    this.backend = backend;
  }

  /**
   * Publish a contract to the registry.
   * Validates the contract before publishing.
   */
  async publish(
    id: string,
    contract: ATPContract,
    metadata: {
      org_id: string;
      wallet?: string;
      description?: string;
      tags?: string[];
    }
  ): Promise<ContractEntry> {
    // Validate first
    const validation = validateContract(contract);
    if (!validation.valid) {
      throw new Error(
        `Cannot publish invalid contract: ${validation.errors.map((e) => e.message).join("; ")}`
      );
    }

    const entry: ContractEntry = {
      id,
      version: contract.version,
      contract,
      publisher: {
        org_id: metadata.org_id,
        wallet: metadata.wallet,
        published_at: new Date().toISOString(),
      },
      content_hash: sha256(canonicalJson(contract)),
      description: metadata.description,
      tags: metadata.tags,
    };

    await this.backend.publish(entry);
    return entry;
  }

  /**
   * Resolve a contract by ID.
   * Returns the latest version unless a specific version is requested.
   */
  async resolve(id: string, version?: string): Promise<ATPContract | null> {
    const entry = await this.backend.resolve(id, version);
    if (!entry) return null;

    // Verify integrity
    const expectedHash = sha256(canonicalJson(entry.contract));
    if (entry.content_hash !== expectedHash) {
      throw new Error(
        `Contract integrity check failed for ${id}@${entry.version}: ` +
          `expected ${entry.content_hash}, got ${expectedHash}`
      );
    }

    return entry.contract;
  }

  /**
   * Search for contracts.
   */
  async search(query: RegistryQuery): Promise<RegistryQueryResult> {
    return this.backend.search(query);
  }

  /**
   * List all versions of a contract.
   */
  async versions(id: string): Promise<string[]> {
    return this.backend.versions(id);
  }

  /**
   * Deprecate a contract version.
   */
  async deprecate(
    id: string,
    version: string,
    message: string
  ): Promise<void> {
    return this.backend.deprecate(id, version, message);
  }

  /**
   * Verify that a contract from the registry hasn't been tampered with.
   */
  async verify(
    id: string,
    version?: string
  ): Promise<{ verified: boolean; entry?: ContractEntry; error?: string }> {
    const entry = await this.backend.resolve(id, version);
    if (!entry) {
      return { verified: false, error: `Contract ${id} not found` };
    }

    const expectedHash = sha256(canonicalJson(entry.contract));
    if (entry.content_hash !== expectedHash) {
      return {
        verified: false,
        entry,
        error: `Hash mismatch: stored=${entry.content_hash}, computed=${expectedHash}`,
      };
    }

    return { verified: true, entry };
  }
}

// ---------------------------------------------------------------------------
// Local Filesystem Backend
// ---------------------------------------------------------------------------

/**
 * File-system registry backend.
 * Stores contracts as JSON files organized by ID and version.
 *
 * Directory structure:
 * ```
 * registry/
 *   io.myorg.payment.v1/
 *     1.0.0.json
 *     1.1.0.json
 *     latest.json → symlink or copy
 * ```
 */
export class LocalRegistryBackend implements RegistryBackend {
  readonly name = "local";
  private directory: string;
  private initialized = false;

  constructor(directory: string) {
    this.directory = directory;
  }

  private async ensureDir(subdir?: string): Promise<void> {
    const dir = subdir ? join(this.directory, subdir) : this.directory;
    await fs.mkdir(dir, { recursive: true });
    this.initialized = true;
  }

  async publish(entry: ContractEntry): Promise<void> {
    const dir = sanitize(entry.id);
    await this.ensureDir(dir);

    const filePath = join(this.directory, dir, `${entry.version}.json`);
    await fs.writeFile(filePath, JSON.stringify(entry, null, 2), "utf-8");

    // Also write as latest
    const latestPath = join(this.directory, dir, "latest.json");
    await fs.writeFile(latestPath, JSON.stringify(entry, null, 2), "utf-8");
  }

  async resolve(
    id: string,
    version?: string
  ): Promise<ContractEntry | null> {
    const dir = sanitize(id);
    const filename = version ? `${version}.json` : "latest.json";
    const filePath = join(this.directory, dir, filename);

    try {
      const raw = await fs.readFile(filePath, "utf-8");
      return JSON.parse(raw) as ContractEntry;
    } catch {
      return null;
    }
  }

  async search(query: RegistryQuery): Promise<RegistryQueryResult> {
    if (!this.initialized) {
      await this.ensureDir();
    }

    const entries: ContractEntry[] = [];

    try {
      const dirs = await fs.readdir(this.directory);

      for (const dir of dirs) {
        const latestPath = join(this.directory, dir, "latest.json");
        try {
          const raw = await fs.readFile(latestPath, "utf-8");
          const entry = JSON.parse(raw) as ContractEntry;

          if (matchesQuery(entry, query)) {
            entries.push(entry);
          }
        } catch {
          // Skip invalid entries
        }
      }
    } catch {
      // Directory doesn't exist yet
    }

    const limit = query.limit ?? 50;
    return {
      entries: entries.slice(0, limit),
      total: entries.length,
      has_more: entries.length > limit,
    };
  }

  async versions(id: string): Promise<string[]> {
    const dir = sanitize(id);
    const dirPath = join(this.directory, dir);

    try {
      const files = await fs.readdir(dirPath);
      return files
        .filter((f) => f.endsWith(".json") && f !== "latest.json")
        .map((f) => f.replace(".json", ""))
        .sort();
    } catch {
      return [];
    }
  }

  async deprecate(
    id: string,
    version: string,
    message: string
  ): Promise<void> {
    const entry = await this.resolve(id, version);
    if (!entry) {
      throw new Error(`Contract ${id}@${version} not found`);
    }

    entry.deprecated = true;
    entry.deprecation_message = message;

    const dir = sanitize(id);
    const filePath = join(this.directory, dir, `${version}.json`);
    await fs.writeFile(filePath, JSON.stringify(entry, null, 2), "utf-8");
  }
}

// ---------------------------------------------------------------------------
// GitHub Registry Backend
// ---------------------------------------------------------------------------

/**
 * GitHub-based registry backend.
 * Reads contracts from a GitHub repository's contracts/ directory.
 * Supports both public and private repos via GitHub API.
 *
 * @example
 * ```typescript
 * const backend = new GitHubRegistryBackend({
 *   owner: "ATP-Protocol",
 *   repo: "contract-registry",
 *   branch: "main",
 *   token: process.env.GITHUB_TOKEN, // Optional for public repos
 * });
 * ```
 */
export class GitHubRegistryBackend implements RegistryBackend {
  readonly name = "github";
  private config: {
    owner: string;
    repo: string;
    branch: string;
    path: string;
    token?: string;
  };

  constructor(config: {
    owner: string;
    repo: string;
    branch?: string;
    path?: string;
    token?: string;
  }) {
    this.config = {
      branch: "main",
      path: "contracts",
      ...config,
    };
  }

  private async ghFetch<T>(path: string): Promise<T> {
    const url = `https://api.github.com/repos/${this.config.owner}/${this.config.repo}/contents/${this.config.path}/${path}?ref=${this.config.branch}`;
    const headers: Record<string, string> = {
      Accept: "application/vnd.github.v3.raw",
      "User-Agent": "atp-protocol-registry",
    };
    if (this.config.token) {
      headers.Authorization = `Bearer ${this.config.token}`;
    }

    const res = await fetch(url, { headers });
    if (!res.ok) {
      if (res.status === 404) return null as T;
      throw new Error(`GitHub API error: ${res.status} ${await res.text()}`);
    }
    return res.json() as Promise<T>;
  }

  async publish(_entry: ContractEntry): Promise<void> {
    throw new Error(
      "GitHubRegistryBackend is read-only. " +
        "Publish contracts by pushing to the repository."
    );
  }

  async resolve(
    id: string,
    version?: string
  ): Promise<ContractEntry | null> {
    const filename = version ? `${version}.json` : "latest.json";
    const path = `${sanitize(id)}/${filename}`;
    try {
      return await this.ghFetch<ContractEntry>(path);
    } catch {
      return null;
    }
  }

  async search(_query: RegistryQuery): Promise<RegistryQueryResult> {
    // GitHub backend doesn't support search — use local for that
    throw new Error(
      "GitHubRegistryBackend does not support search. " +
        "Clone the registry locally and use LocalRegistryBackend for search."
    );
  }

  async versions(id: string): Promise<string[]> {
    const url = `https://api.github.com/repos/${this.config.owner}/${this.config.repo}/contents/${this.config.path}/${sanitize(id)}?ref=${this.config.branch}`;
    const headers: Record<string, string> = {
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "atp-protocol-registry",
    };
    if (this.config.token) {
      headers.Authorization = `Bearer ${this.config.token}`;
    }

    try {
      const res = await fetch(url, { headers });
      if (!res.ok) return [];
      const files = (await res.json()) as Array<{ name: string }>;
      return files
        .filter((f) => f.name.endsWith(".json") && f.name !== "latest.json")
        .map((f) => f.name.replace(".json", ""));
    } catch {
      return [];
    }
  }

  async deprecate(): Promise<void> {
    throw new Error(
      "GitHubRegistryBackend is read-only. " +
        "Deprecate contracts by updating the repository."
    );
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function matchesQuery(entry: ContractEntry, query: RegistryQuery): boolean {
  if (!query.include_deprecated && entry.deprecated) return false;

  if (query.action) {
    if (!entry.contract.actions.includes(query.action)) return false;
  }

  if (query.authority_pattern) {
    const pattern = query.authority_pattern.replace(/\*/g, ".*");
    const regex = new RegExp(`^${pattern}$`);
    if (!regex.test(entry.contract.authority)) return false;
  }

  if (query.tag) {
    if (!entry.tags?.includes(query.tag)) return false;
  }

  if (query.publisher_org) {
    if (entry.publisher.org_id !== query.publisher_org) return false;
  }

  if (query.text) {
    const searchText = query.text.toLowerCase();
    const searchable = [
      entry.id,
      entry.description,
      ...(entry.tags ?? []),
      entry.contract.authority,
      ...entry.contract.actions,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    if (!searchable.includes(searchText)) return false;
  }

  return true;
}

function sanitize(input: string): string {
  return input.replace(/[^a-zA-Z0-9._-]/g, "_");
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
