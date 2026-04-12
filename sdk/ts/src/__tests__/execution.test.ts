/**
 * Execution Module Tests
 */

import { describe, it, expect } from "vitest";
import {
  execute,
  classifyOutcome,
  generateIdempotencyKey,
  generateExecutionId,
  isRetryable,
} from "../execution";
import type { ATPContract } from "../types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeContract(overrides: Partial<ATPContract> = {}): ATPContract & { id: string } {
  return {
    id: "ctr_test",
    version: "1.0.0",
    authority: "org.test.agent",
    actions: ["test-action"],
    attestation: "full",
    ...overrides,
  } as ATPContract & { id: string };
}

// ---------------------------------------------------------------------------
// execute
// ---------------------------------------------------------------------------

describe("execute", () => {
  it("executes successfully", async () => {
    const result = await execute(
      async () => ({ data: "hello" }),
      {
        contract: makeContract(),
        action: "test-action",
        params: { key: "value" },
        requesting_wallet: "0xAgent",
      }
    );

    expect(result.outcome).toBe("outcome:success");
    expect(result.result).toEqual({ data: "hello" });
    expect(result.record.execution_id).toMatch(/^exe_/);
    expect(result.record.idempotency_key).toMatch(/^idk_/);
    expect(result.duration_ms).toBeGreaterThanOrEqual(0);
  });

  it("handles handler errors", async () => {
    const result = await execute(
      async () => { throw new Error("boom"); },
      {
        contract: makeContract(),
        action: "test-action",
        params: {},
        requesting_wallet: "0xAgent",
      }
    );

    expect(result.outcome).toBe("outcome:failure");
    expect(result.error).toBe("boom");
    expect(result.record.outcome).toBe("outcome:failure");
  });

  it("enforces timeout", async () => {
    const result = await execute(
      async (ctx) => {
        await new Promise((resolve, reject) => {
          const timer = setTimeout(resolve, 5000);
          ctx.signal.addEventListener("abort", () => {
            clearTimeout(timer);
            reject(new Error("Aborted"));
          });
        });
      },
      {
        contract: makeContract(),
        action: "test-action",
        params: {},
        requesting_wallet: "0xAgent",
        timeout_ms: 50, // 50ms timeout
      }
    );

    expect(result.outcome).toBe("outcome:timeout");
  }, 10_000);

  it("provides execution context to handler", async () => {
    let capturedCtx: any;

    await execute(
      async (ctx) => {
        capturedCtx = ctx;
        return null;
      },
      {
        contract: makeContract(),
        action: "my-action",
        params: { foo: "bar" },
        requesting_wallet: "0xAgent",
        injection_headers: { Authorization: "Bearer test" },
      }
    );

    expect(capturedCtx.action).toBe("my-action");
    expect(capturedCtx.scope_params).toEqual({ foo: "bar" });
    expect(capturedCtx.injection_headers?.Authorization).toBe("Bearer test");
    expect(capturedCtx.signal).toBeTruthy();
  });

  it("calls lifecycle hooks", async () => {
    const calls: string[] = [];

    await execute(
      async () => ({ ok: true }),
      {
        contract: makeContract(),
        action: "test-action",
        params: {},
        requesting_wallet: "0xAgent",
        hooks: {
          onBeforeExecute: async () => { calls.push("before"); },
          onAfterExecute: async () => { calls.push("after"); },
          onRecord: async () => { calls.push("record"); },
        },
      }
    );

    expect(calls).toEqual(["before", "after", "record"]);
  });

  it("calls error hook on failure", async () => {
    let capturedError: Error | undefined;

    await execute(
      async () => { throw new Error("test-error"); },
      {
        contract: makeContract(),
        action: "test-action",
        params: {},
        requesting_wallet: "0xAgent",
        hooks: {
          onError: async (_ctx, err) => { capturedError = err; },
        },
      }
    );

    expect(capturedError?.message).toBe("test-error");
  });

  it("generates correct execution record", async () => {
    const result = await execute(
      async () => ({ status: 200 }),
      {
        contract: makeContract({ credentials: { provider: "stripe", scope: ["charge"] } }),
        action: "charge",
        params: { amount: 100 },
        requesting_wallet: "0xAgent",
        gateway_id: "gw_main",
      }
    );

    const record = result.record;
    expect(record.contract_id).toBe("ctr_test");
    expect(record.action).toBe("charge");
    expect(record.outcome).toBe("outcome:success");
    expect(record.request_hash).toMatch(/^sha256:/);
    expect(record.credential_provider).toBe("stripe");
    expect(record.credential_scope_used).toEqual(["charge"]);
    expect(record.gateway_id).toBe("gw_main");
    expect(record.started_at).toBeTruthy();
    expect(record.completed_at).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// classifyOutcome
// ---------------------------------------------------------------------------

describe("classifyOutcome", () => {
  it("classifies null as success", () => {
    expect(classifyOutcome(null)).toBe("outcome:success");
  });

  it("classifies undefined as success", () => {
    expect(classifyOutcome(undefined)).toBe("outcome:success");
  });

  it("classifies plain object as success", () => {
    expect(classifyOutcome({ data: "ok" })).toBe("outcome:success");
  });

  it("respects explicit outcome marker", () => {
    expect(classifyOutcome({ outcome: "outcome:partial" })).toBe("outcome:partial");
    expect(classifyOutcome({ outcome: "outcome:denied" })).toBe("outcome:denied");
  });

  it("detects partial result markers", () => {
    expect(classifyOutcome({ partial: true })).toBe("outcome:partial");
    expect(classifyOutcome({ is_partial: true })).toBe("outcome:partial");
  });

  it("detects error markers", () => {
    expect(classifyOutcome({ error: true })).toBe("outcome:failure");
    expect(classifyOutcome({ status: 500 })).toBe("outcome:failure");
  });

  it("ignores invalid outcome strings", () => {
    expect(classifyOutcome({ outcome: "not-a-real-outcome" })).toBe("outcome:success");
  });
});

// ---------------------------------------------------------------------------
// generateIdempotencyKey
// ---------------------------------------------------------------------------

describe("generateIdempotencyKey", () => {
  it("produces deterministic keys", () => {
    const key1 = generateIdempotencyKey("secret", "ctr_1", "send", { to: "a" }, "0xW", "n1");
    const key2 = generateIdempotencyKey("secret", "ctr_1", "send", { to: "a" }, "0xW", "n1");
    expect(key1).toBe(key2);
  });

  it("produces different keys for different inputs", () => {
    const key1 = generateIdempotencyKey("secret", "ctr_1", "send", { to: "a" }, "0xW", "n1");
    const key2 = generateIdempotencyKey("secret", "ctr_1", "send", { to: "b" }, "0xW", "n1");
    expect(key1).not.toBe(key2);
  });

  it("produces idk_ prefixed keys", () => {
    const key = generateIdempotencyKey("secret", "ctr_1", "send", {}, "0xW", "n1");
    expect(key).toMatch(/^idk_[a-f0-9]{32}$/);
  });

  it("produces different keys for different secrets", () => {
    const key1 = generateIdempotencyKey("secret1", "ctr_1", "send", {}, "0xW", "n1");
    const key2 = generateIdempotencyKey("secret2", "ctr_1", "send", {}, "0xW", "n1");
    expect(key1).not.toBe(key2);
  });
});

// ---------------------------------------------------------------------------
// generateExecutionId
// ---------------------------------------------------------------------------

describe("generateExecutionId", () => {
  it("produces exe_ prefixed IDs", () => {
    const id = generateExecutionId();
    expect(id).toMatch(/^exe_[a-z0-9]{16}$/);
  });

  it("produces unique IDs", () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateExecutionId()));
    expect(ids.size).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// isRetryable
// ---------------------------------------------------------------------------

describe("isRetryable", () => {
  it("failure is retryable", () => {
    expect(isRetryable("outcome:failure")).toBe(true);
  });

  it("timeout is retryable", () => {
    expect(isRetryable("outcome:timeout")).toBe(true);
  });

  it("unknown is retryable", () => {
    expect(isRetryable("outcome:unknown")).toBe(true);
  });

  it("success is not retryable", () => {
    expect(isRetryable("outcome:success")).toBe(false);
  });

  it("denied is not retryable", () => {
    expect(isRetryable("outcome:denied")).toBe(false);
  });

  it("partial is not retryable", () => {
    expect(isRetryable("outcome:partial")).toBe(false);
  });
});
