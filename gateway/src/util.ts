/**
 * Gateway Utilities
 */

import { createHash, createHmac } from "crypto";

/**
 * SHA-256 hash of a string.
 */
export function sha256(input: string): string {
  return `sha256:${createHash("sha256").update(input).digest("hex")}`;
}

/**
 * Generate an idempotency key from execution parameters.
 * Uses HMAC-SHA256 as specified in Section 11.1.
 */
export function generateIdempotencyKey(
  gatewaySecret: string,
  contractId: string,
  action: string,
  scopeParams: Record<string, unknown>,
  requestingWallet: string,
  nonce: string
): string {
  const payload = `${contractId}||${action}||${canonicalJson(scopeParams)}||${requestingWallet}||${nonce}`;
  const hmac = createHmac("sha256", gatewaySecret).update(payload).digest("hex");
  return `idk_${hmac.slice(0, 32)}`;
}

/**
 * Deterministic JSON serialization for hashing.
 */
export function canonicalJson(obj: unknown): string {
  if (obj === null || obj === undefined) return "null";
  if (typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) {
    return `[${obj.map(canonicalJson).join(",")}]`;
  }
  const sorted = Object.keys(obj as Record<string, unknown>).sort();
  const pairs = sorted.map(
    (key) => `${JSON.stringify(key)}:${canonicalJson((obj as Record<string, unknown>)[key])}`
  );
  return `{${pairs.join(",")}}`;
}

/**
 * Parse an ISO 8601 duration to milliseconds.
 * Supports: PTnH, PTnM, PTnS, and combinations.
 */
export function parseDuration(duration: string): number {
  const match = duration.match(
    /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/
  );
  if (!match) return 30_000; // Default 30s

  const days = parseInt(match[1] || "0", 10);
  const hours = parseInt(match[2] || "0", 10);
  const minutes = parseInt(match[3] || "0", 10);
  const seconds = parseFloat(match[4] || "0");

  return (days * 86400 + hours * 3600 + minutes * 60 + seconds) * 1000;
}

/**
 * Generate a unique execution ID.
 */
export function generateExecutionId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "exe_";
  for (let i = 0; i < 16; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
