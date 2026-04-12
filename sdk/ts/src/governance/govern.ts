/**
 * ATP Governance Wrapper
 *
 * The primary developer-facing API for governing MCP tool calls.
 * Wraps a tool handler with ATP governance: authority, policy, approval,
 * credential brokerage, execution, and evidence capture.
 */

import type {
  ATPContract,
  GovernOptions,
  GovernedResult,
  GatewayConfig,
  ExecutionOutcome,
} from "../types";
import { validateContract, isContractExpired } from "../contract/validate";
import { evaluatePolicy } from "../policy/evaluate";

/**
 * Wrap an MCP tool handler with ATP governance.
 *
 * This is the primary API for developers integrating ATP.
 *
 * @example
 * ```typescript
 * import { atpGovern } from "@atp-protocol/sdk";
 *
 * // Govern an MCP tool
 * server.tool("send-email", atpGovern({
 *   contract: "contracts/procurement-email.json",
 *   gateway: "https://gateway.your-org.com"
 * }, sendEmailHandler));
 *
 * // Govern with inline contract
 * server.tool("send-email", atpGovern({
 *   contract: {
 *     version: "1.0.0",
 *     authority: "org.procurement.send-email",
 *     actions: ["send-email"],
 *     attestation: "full"
 *   },
 *   gateway: "https://gateway.your-org.com"
 * }, sendEmailHandler));
 * ```
 */
export function atpGovern<TArgs = unknown, TResult = unknown>(
  options: GovernOptions,
  handler: (args: TArgs) => Promise<TResult>
): (args: TArgs) => Promise<GovernedResult<TResult>> {
  const gateway = resolveGateway(options.gateway);

  return async (args: TArgs): Promise<GovernedResult<TResult>> => {
    const executionId = generateExecutionId();

    try {
      // 1. Resolve contract
      const contract = await resolveContract(options.contract);

      // 2. Validate contract
      const validation = validateContract(contract);
      if (!validation.valid) {
        const reason = `Contract validation failed: ${validation.errors.map((e) => e.message).join("; ")}`;
        await options.onDenied?.(reason, {
          stage: "policy",
          action: contract.actions?.[0],
          details: { errors: validation.errors },
        });
        return {
          outcome: "outcome:denied",
          execution_id: executionId,
          denied_reason: reason,
          denied_stage: "policy",
        };
      }

      // 3. Check expiry
      if (isContractExpired(contract)) {
        const reason = "Contract has expired";
        await options.onDenied?.(reason, {
          stage: "policy",
          contract_id: contract.template,
          action: contract.actions[0],
          details: { expiry: contract.expiry },
        });
        return {
          outcome: "outcome:denied",
          execution_id: executionId,
          denied_reason: reason,
          denied_stage: "policy",
        };
      }

      // 4. Local policy evaluation
      const requestParams = typeof args === "object" && args !== null
        ? args as Record<string, unknown>
        : {};

      const policyResult = evaluatePolicy(contract, requestParams);
      if (!policyResult.permitted) {
        const reason = policyResult.denial_reason ?? "Policy evaluation failed";
        await options.onDenied?.(reason, {
          stage: "policy",
          action: contract.actions[0],
          details: { policy_result: policyResult },
        });
        return {
          outcome: "outcome:denied",
          execution_id: executionId,
          denied_reason: reason,
          denied_stage: "policy",
        };
      }

      // 5. If gateway is configured, delegate full governance to gateway
      if (gateway.url !== "local") {
        return await executeViaGateway(gateway, contract, args, handler, executionId, options);
      }

      // 6. Local execution (no gateway — ATP-Aware/Compatible mode)
      const result = await executeLocally(handler, args, executionId);
      return result;
    } catch (error) {
      return {
        outcome: "outcome:failure",
        execution_id: executionId,
        denied_reason: error instanceof Error ? error.message : "Unknown error",
      };
    }
  };
}

/**
 * Create a governed execution context for manual flow control.
 *
 * Use this when you need more control than `atpGovern` provides,
 * e.g., custom approval UIs or multi-step workflows.
 *
 * @example
 * ```typescript
 * import { createGovernedContext } from "@atp-protocol/sdk";
 *
 * const ctx = await createGovernedContext({
 *   contract: myContract,
 *   gateway: "https://gateway.your-org.com"
 * });
 *
 * // Check authority
 * const authResult = await ctx.checkAuthority();
 * if (!authResult.authorized) throw new Error(authResult.denial_reason);
 *
 * // Evaluate policy
 * const policyResult = await ctx.evaluatePolicy(requestParams);
 * if (!policyResult.permitted) throw new Error(policyResult.denial_reason);
 *
 * // Request approval (if required)
 * if (ctx.requiresApproval()) {
 *   const approval = await ctx.requestApproval();
 *   await ctx.waitForApproval(approval);
 * }
 *
 * // Execute
 * const result = await ctx.execute(handler, args);
 * ```
 */
export async function createGovernedContext(options: GovernOptions): Promise<GovernedContext> {
  const contract = await resolveContract(options.contract);
  const gateway = resolveGateway(options.gateway);

  return new GovernedContext(contract, gateway, options);
}

export class GovernedContext {
  readonly contract: ATPContract;
  readonly gateway: GatewayConfig;
  readonly options: GovernOptions;
  readonly executionId: string;

  constructor(contract: ATPContract, gateway: GatewayConfig, options: GovernOptions) {
    this.contract = contract;
    this.gateway = gateway;
    this.options = options;
    this.executionId = generateExecutionId();
  }

  /**
   * Validate the contract locally.
   */
  validate() {
    return validateContract(this.contract);
  }

  /**
   * Evaluate policy locally against request params.
   */
  evaluatePolicy(requestParams: Record<string, unknown>) {
    return evaluatePolicy(this.contract, requestParams);
  }

  /**
   * Check if this contract requires approval.
   */
  requiresApproval(amount?: number): boolean {
    if (!this.contract.approval?.required) return false;
    if (this.contract.approval.required_above == null) return true;
    if (amount === undefined) return true;
    return amount > this.contract.approval.required_above;
  }

  /**
   * Check if the contract is expired.
   */
  isExpired(): boolean {
    return isContractExpired(this.contract);
  }
}

// ---------------------------------------------------------------------------
// Internal: Gateway execution
// ---------------------------------------------------------------------------

async function executeViaGateway<TArgs, TResult>(
  gateway: GatewayConfig,
  contract: ATPContract,
  args: TArgs,
  handler: (args: TArgs) => Promise<TResult>,
  executionId: string,
  options: GovernOptions
): Promise<GovernedResult<TResult>> {
  // In a full implementation, this would:
  // 1. POST the execution request to the gateway
  // 2. Gateway handles authority, approval, credentials, execution
  // 3. Return the governed result
  //
  // For the initial SDK, we provide the local flow with gateway hooks.
  // The reference gateway will implement the full mediated flow.

  const timeout = gateway.timeout ?? 30_000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const result = await handler(args);
    clearTimeout(timeoutId);

    const governedResult: GovernedResult<TResult> = {
      outcome: "outcome:success",
      result,
      execution_id: executionId,
    };

    return governedResult;
  } catch (error) {
    clearTimeout(timeoutId);

    if (controller.signal.aborted) {
      return {
        outcome: "outcome:timeout",
        execution_id: executionId,
        denied_reason: `Execution timed out after ${timeout}ms`,
      };
    }

    return {
      outcome: "outcome:failure",
      execution_id: executionId,
      denied_reason: error instanceof Error ? error.message : "Execution failed",
    };
  }
}

// ---------------------------------------------------------------------------
// Internal: Local execution
// ---------------------------------------------------------------------------

async function executeLocally<TArgs, TResult>(
  handler: (args: TArgs) => Promise<TResult>,
  args: TArgs,
  executionId: string
): Promise<GovernedResult<TResult>> {
  try {
    const result = await handler(args);
    return {
      outcome: "outcome:success",
      result,
      execution_id: executionId,
    };
  } catch (error) {
    return {
      outcome: "outcome:failure",
      execution_id: executionId,
      denied_reason: error instanceof Error ? error.message : "Execution failed",
    };
  }
}

// ---------------------------------------------------------------------------
// Internal: Helpers
// ---------------------------------------------------------------------------

async function resolveContract(contract: string | ATPContract): Promise<ATPContract> {
  if (typeof contract === "string") {
    // In a full implementation, this would load from a file or registry
    // For now, we require inline contracts or a custom loader
    throw new Error(
      `String contract paths require a contract loader. ` +
      `Pass an ATPContract object or use loadContract() first.`
    );
  }
  return contract;
}

function resolveGateway(gateway: string | GatewayConfig): GatewayConfig {
  if (typeof gateway === "string") {
    return { url: gateway, timeout: 30_000, retries: 0 };
  }
  return { timeout: 30_000, retries: 0, ...gateway };
}

function generateExecutionId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "exe_";
  for (let i = 0; i < 16; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
