/**
 * Managed Execution
 *
 * Wraps tool handler invocations with timeout enforcement, outcome classification,
 * idempotency key generation, and lifecycle hooks.
 *
 * Follows ATP Spec Section 9 — Execution Semantics.
 */

import { createHash, createHmac } from "crypto";
import type {
  ATPContract,
  ExecutionOutcome,
  ExecutionRecord,
  IdempotencyModel,
  EvidenceRecord,
} from "../types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Context available during execution.
 */
export interface ExecutionContext {
  /** Unique execution ID. */
  execution_id: string;
  /** Contract being executed against. */
  contract: ATPContract;
  /** Action being performed. */
  action: string;
  /** Scope parameters. */
  scope_params: Record<string, unknown>;
  /** Requesting wallet address. */
  requesting_wallet: string;
  /** Idempotency key (if gateway-enforced). */
  idempotency_key?: string;
  /** Credential injection headers (if credentials were resolved). */
  injection_headers?: Record<string, string>;
  /** Abort signal for timeout enforcement. */
  signal: AbortSignal;
}

/**
 * Lifecycle hooks for execution.
 */
export interface ExecutionHooks {
  /** Called before the handler is invoked. */
  onBeforeExecute?: (ctx: ExecutionContext) => Promise<void>;
  /** Called after successful execution. */
  onAfterExecute?: (ctx: ExecutionContext, result: unknown) => Promise<void>;
  /** Called when execution fails. */
  onError?: (ctx: ExecutionContext, error: Error) => Promise<void>;
  /** Called when execution times out. */
  onTimeout?: (ctx: ExecutionContext) => Promise<void>;
  /** Called with the final execution record. */
  onRecord?: (record: ExecutionRecord) => Promise<void>;
}

/**
 * Options for managed execution.
 */
export interface ExecutionOptions {
  /** Contract to execute against. */
  contract: ATPContract & { id?: string };
  /** Action name. */
  action: string;
  /** Request parameters (scope). */
  params: Record<string, unknown>;
  /** Requesting wallet address. */
  requesting_wallet: string;
  /** Gateway ID for record keeping. */
  gateway_id?: string;
  /** Gateway secret for HMAC-based idempotency keys. */
  gateway_secret?: string;
  /** Request nonce (for idempotency). */
  nonce?: string;
  /** Credential injection headers. */
  injection_headers?: Record<string, string>;
  /** Timeout override in milliseconds. */
  timeout_ms?: number;
  /** Lifecycle hooks. */
  hooks?: ExecutionHooks;
}

/**
 * Result of a managed execution.
 */
export interface ManagedExecutionResult<T = unknown> {
  /** Classified outcome. */
  outcome: ExecutionOutcome;
  /** Handler return value (if successful). */
  result?: T;
  /** Execution record for evidence. */
  record: ExecutionRecord;
  /** Error details if failed. */
  error?: string;
  /** Duration in milliseconds. */
  duration_ms: number;
}

// ---------------------------------------------------------------------------
// Managed Execution
// ---------------------------------------------------------------------------

/**
 * Execute a tool handler with ATP managed execution semantics.
 *
 * Provides: timeout enforcement, outcome classification, idempotency key
 * generation, and execution record creation.
 *
 * @example
 * ```typescript
 * import { execute } from "@atp-protocol/sdk/execution";
 *
 * const result = await execute(
 *   async (ctx) => {
 *     // ctx.signal for timeout-aware operations
 *     // ctx.injection_headers for credential-injected HTTP calls
 *     const response = await fetch("https://api.example.com/action", {
 *       signal: ctx.signal,
 *       headers: { ...ctx.injection_headers },
 *     });
 *     return response.json();
 *   },
 *   {
 *     contract: myContract,
 *     action: "fetch-data",
 *     params: { dataset: "quarterly-revenue" },
 *     requesting_wallet: "0xAgent",
 *   }
 * );
 *
 * if (result.outcome === "outcome:success") {
 *   console.log(result.result);
 * }
 * ```
 */
export async function execute<T>(
  handler: (ctx: ExecutionContext) => Promise<T>,
  options: ExecutionOptions
): Promise<ManagedExecutionResult<T>> {
  const executionId = generateExecutionId();
  const startedAt = new Date();

  // Parse timeout from contract or use override
  const timeoutMs = options.timeout_ms ?? parseTimeout(options.contract.execution_timeout);

  // Generate idempotency key
  const idempotencyKey = generateIdempotencyKey(
    options.gateway_secret ?? "local",
    options.contract.id ?? options.contract.authority,
    options.action,
    options.params,
    options.requesting_wallet,
    options.nonce ?? startedAt.toISOString()
  );

  // Create abort controller for timeout
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  // Build context
  const ctx: ExecutionContext = {
    execution_id: executionId,
    contract: options.contract,
    action: options.action,
    scope_params: options.params,
    requesting_wallet: options.requesting_wallet,
    idempotency_key: idempotencyKey,
    injection_headers: options.injection_headers,
    signal: controller.signal,
  };

  try {
    // Pre-execution hook
    await options.hooks?.onBeforeExecute?.(ctx);

    // Execute handler
    const result = await handler(ctx);
    clearTimeout(timeoutHandle);

    const completedAt = new Date();
    const outcome = classifyOutcome(result);

    // Post-execution hook
    await options.hooks?.onAfterExecute?.(ctx, result);

    // Build execution record
    const record = buildRecord(
      executionId,
      options,
      outcome,
      idempotencyKey,
      startedAt,
      completedAt,
      result
    );

    await options.hooks?.onRecord?.(record);

    return {
      outcome,
      result,
      record,
      duration_ms: completedAt.getTime() - startedAt.getTime(),
    };
  } catch (error) {
    clearTimeout(timeoutHandle);
    const completedAt = new Date();
    const err = error instanceof Error ? error : new Error(String(error));

    let outcome: ExecutionOutcome;

    if (controller.signal.aborted) {
      outcome = "outcome:timeout";
      await options.hooks?.onTimeout?.(ctx);
    } else {
      outcome = "outcome:failure";
      await options.hooks?.onError?.(ctx, err);
    }

    const record = buildRecord(
      executionId,
      options,
      outcome,
      idempotencyKey,
      startedAt,
      completedAt
    );

    await options.hooks?.onRecord?.(record);

    return {
      outcome,
      record,
      error: err.message,
      duration_ms: completedAt.getTime() - startedAt.getTime(),
    };
  }
}

// ---------------------------------------------------------------------------
// Outcome Classification
// ---------------------------------------------------------------------------

/**
 * Classify a handler result into an ATP execution outcome.
 *
 * Rules (Spec Section 9.2):
 * - If the handler returns successfully → outcome:success
 * - If the result contains a partial marker → outcome:partial
 * - If the handler throws → outcome:failure (handled by execute())
 * - If the handler times out → outcome:timeout (handled by execute())
 */
export function classifyOutcome(result: unknown): ExecutionOutcome {
  if (result === null || result === undefined) {
    return "outcome:success"; // Void handlers are success
  }

  if (typeof result === "object" && result !== null) {
    const obj = result as Record<string, unknown>;

    // Check for explicit outcome marker
    if (typeof obj.outcome === "string") {
      const validOutcomes: ExecutionOutcome[] = [
        "outcome:success",
        "outcome:failure",
        "outcome:denied",
        "outcome:timeout",
        "outcome:partial",
        "outcome:unknown",
      ];
      if (validOutcomes.includes(obj.outcome as ExecutionOutcome)) {
        return obj.outcome as ExecutionOutcome;
      }
    }

    // Check for partial result markers
    if (obj.partial === true || obj.is_partial === true) {
      return "outcome:partial";
    }

    // Check for error markers
    if (obj.error === true || (typeof obj.status === "number" && obj.status >= 400)) {
      return "outcome:failure";
    }
  }

  return "outcome:success";
}

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------

/**
 * Generate a deterministic idempotency key using HMAC-SHA256.
 * As specified in ATP Spec Section 11.1.
 *
 * The key is deterministic: same inputs always produce the same key.
 * This allows gateways to deduplicate repeated requests.
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
  const hmac = createHmac("sha256", gatewaySecret)
    .update(payload)
    .digest("hex");
  return `idk_${hmac.slice(0, 32)}`;
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

/**
 * Check if an execution outcome is retryable.
 *
 * Retryable: failure, timeout, unknown
 * Not retryable: success, denied, partial
 */
export function isRetryable(outcome: ExecutionOutcome): boolean {
  return (
    outcome === "outcome:failure" ||
    outcome === "outcome:timeout" ||
    outcome === "outcome:unknown"
  );
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function buildRecord(
  executionId: string,
  options: ExecutionOptions,
  outcome: ExecutionOutcome,
  idempotencyKey: string,
  startedAt: Date,
  completedAt: Date,
  result?: unknown
): ExecutionRecord {
  return {
    execution_id: executionId,
    contract_id: options.contract.id ?? options.contract.authority,
    action: options.action,
    outcome,
    request_hash: sha256(canonicalJson(options.params)),
    response_summary: result
      ? {
          body_hash: sha256(canonicalJson(result)),
        }
      : undefined,
    credential_provider: options.contract.credentials?.provider,
    credential_scope_used: options.contract.credentials?.scope,
    started_at: startedAt.toISOString(),
    completed_at: completedAt.toISOString(),
    idempotency_key: idempotencyKey,
    gateway_id: options.gateway_id ?? "local",
  };
}

function parseTimeout(duration?: string): number {
  if (!duration) return 30_000; // Default 30s

  const match = duration.match(
    /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/
  );
  if (!match) return 30_000;

  const days = parseInt(match[1] || "0", 10);
  const hours = parseInt(match[2] || "0", 10);
  const minutes = parseInt(match[3] || "0", 10);
  const seconds = parseFloat(match[4] || "0");

  return (days * 86400 + hours * 3600 + minutes * 60 + seconds) * 1000;
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
