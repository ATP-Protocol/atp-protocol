/**
 * ATP Execution Module
 *
 * Managed execution of governed tool calls with timeout, idempotency,
 * outcome classification, and evidence capture hooks.
 *
 * @packageDocumentation
 */

export {
  type ExecutionContext,
  type ExecutionHooks,
  type ExecutionOptions,
  type ManagedExecutionResult,
  execute,
  classifyOutcome,
  generateIdempotencyKey,
  generateExecutionId,
  isRetryable,
} from "./managed";
