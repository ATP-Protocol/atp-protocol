/**
 * Governed Tool — wraps a LangChain StructuredTool with ATP governance.
 *
 * The wrapper intercepts every tool invocation and:
 * 1. Validates the ATP contract
 * 2. Evaluates policy against the tool arguments
 * 3. Executes the tool if permitted
 * 4. Records evidence of the execution
 * 5. Denies and records if policy fails
 */

import {
  validateContract,
  evaluatePolicy,
  isContractExpired,
  buildEvidence,
  verifyEvidence,
} from "@atp-protocol/sdk";
import type {
  ATPContract,
  EvidenceRecord,
  ExecutionOutcome,
  PolicyEvaluation,
} from "@atp-protocol/sdk";
import type { EvidenceBackend } from "@atp-protocol/sdk/evidence";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Options for governing a LangChain tool.
 */
export interface GovernToolOptions {
  /** ATP contract to enforce. Can be inline or loaded. */
  contract: ATPContract;
  /** Requesting wallet address. */
  wallet?: string;
  /** Organization ID. */
  org_id?: string;
  /** Evidence backend for recording executions. */
  evidenceBackend?: EvidenceBackend;
  /** Gateway ID for evidence records. */
  gateway_id?: string;
  /** Called when a tool invocation is denied. */
  onDenied?: (reason: string, args: Record<string, unknown>) => void;
  /** Called when evidence is captured. */
  onEvidence?: (record: EvidenceRecord) => void;
}

/**
 * Result from a governed tool invocation.
 */
export interface GovernedToolResult {
  /** Whether the invocation was permitted. */
  permitted: boolean;
  /** The tool's output (if permitted and successful). */
  output?: string;
  /** ATP execution outcome. */
  outcome: ExecutionOutcome;
  /** Policy evaluation result. */
  policy: PolicyEvaluation;
  /** Evidence record (if captured). */
  evidence?: EvidenceRecord;
  /** Denial reason (if denied). */
  denial_reason?: string;
}

// ---------------------------------------------------------------------------
// LangChain Tool Interface (minimal — avoids hard dependency version issues)
// ---------------------------------------------------------------------------

/**
 * Minimal interface for a LangChain-compatible tool.
 * Works with StructuredTool, DynamicTool, and any tool with name + invoke.
 */
interface LangChainTool {
  name: string;
  description: string;
  invoke(input: any, config?: any): Promise<string>;
  schema?: any;
}

// ---------------------------------------------------------------------------
// GovernedTool class
// ---------------------------------------------------------------------------

/**
 * A LangChain tool wrapped with ATP governance.
 *
 * Implements the same interface as a LangChain tool (name, description, invoke)
 * so it can be used as a drop-in replacement in any agent or chain.
 */
export class GovernedTool {
  readonly name: string;
  readonly description: string;
  readonly schema?: any;
  readonly atp_contract: ATPContract;

  private tool: LangChainTool;
  private options: GovernToolOptions;

  constructor(tool: LangChainTool, options: GovernToolOptions) {
    this.tool = tool;
    this.options = options;
    this.atp_contract = options.contract;

    // Prefix the tool name to indicate governance
    this.name = tool.name;
    this.description = `[ATP-Governed] ${tool.description}`;
    this.schema = tool.schema;
  }

  /**
   * Invoke the tool with ATP governance.
   */
  async invoke(input: any, config?: any): Promise<string> {
    const result = await this.governedInvoke(input, config);

    if (!result.permitted) {
      return `[ATP DENIED] ${result.denial_reason}`;
    }

    return result.output ?? "[ATP] Execution completed with no output";
  }

  /**
   * Full governed invocation with detailed result.
   */
  async governedInvoke(
    input: any,
    _config?: any
  ): Promise<GovernedToolResult> {
    const contract = this.options.contract;
    const args =
      typeof input === "object" && input !== null
        ? (input as Record<string, unknown>)
        : { input };

    // 1. Validate contract
    const validation = validateContract(contract);
    if (!validation.valid) {
      const reason = `Contract invalid: ${validation.errors.map((e) => e.message).join("; ")}`;
      return this.deny(reason, args, {
        permitted: false,
        policies_evaluated: 0,
        constraints_applied: [],
        evaluated_at: new Date().toISOString(),
        denial_reason: reason,
      });
    }

    // 2. Check expiry
    if (isContractExpired(contract)) {
      return this.deny("Contract expired", args, {
        permitted: false,
        policies_evaluated: 0,
        constraints_applied: [],
        evaluated_at: new Date().toISOString(),
        denial_reason: "Contract expired",
      });
    }

    // 3. Evaluate policy
    const policy = evaluatePolicy(contract, args);
    if (!policy.permitted) {
      return this.deny(
        policy.denial_reason ?? "Policy denied",
        args,
        policy
      );
    }

    // 4. Execute tool
    try {
      const output = await this.tool.invoke(input);
      const evidence = await this.recordEvidence(
        args,
        "outcome:success",
        policy,
        output
      );

      return {
        permitted: true,
        output,
        outcome: "outcome:success",
        policy,
        evidence,
      };
    } catch (error) {
      const errMsg =
        error instanceof Error ? error.message : String(error);
      const evidence = await this.recordEvidence(
        args,
        "outcome:failure",
        policy
      );

      return {
        permitted: true,
        outcome: "outcome:failure",
        policy,
        evidence,
        denial_reason: `Execution failed: ${errMsg}`,
      };
    }
  }

  private async deny(
    reason: string,
    args: Record<string, unknown>,
    policy: PolicyEvaluation
  ): Promise<GovernedToolResult> {
    this.options.onDenied?.(reason, args);

    const evidence = await this.recordEvidence(
      args,
      "outcome:denied",
      policy
    );

    return {
      permitted: false,
      outcome: "outcome:denied",
      policy,
      evidence,
      denial_reason: reason,
    };
  }

  private async recordEvidence(
    args: Record<string, unknown>,
    outcome: ExecutionOutcome,
    policy: PolicyEvaluation,
    response?: unknown
  ): Promise<EvidenceRecord | undefined> {
    const backend = this.options.evidenceBackend;
    if (!backend) return undefined;

    const record = buildEvidence({
      contract_id: this.options.contract.template ?? this.options.contract.authority,
      execution_id: `exe_lc_${Date.now().toString(36)}`,
      authority: this.options.contract.authority,
      requesting_wallet: this.options.wallet ?? "0x0",
      requesting_org: this.options.org_id ?? "",
      action: this.tool.name,
      scope_snapshot: args,
      outcome,
      request_payload: args,
      response_payload: response,
      attestation_level: this.options.contract.attestation,
      gateway_id: this.options.gateway_id ?? "langchain-adapter",
      policy_snapshot: {
        policies_evaluated: policy.policies_evaluated,
        constraints_applied: policy.constraints_applied,
      },
    });

    await backend.store(record);
    this.options.onEvidence?.(record);
    return record;
  }
}

// ---------------------------------------------------------------------------
// Convenience function
// ---------------------------------------------------------------------------

/**
 * Wrap a LangChain tool with ATP governance.
 *
 * @example
 * ```typescript
 * import { governTool } from "@atp-protocol/langchain";
 *
 * const governed = governTool(myTool, {
 *   contract: {
 *     version: "1.0.0",
 *     authority: "org.myteam.web-search",
 *     actions: ["search"],
 *     attestation: "full",
 *   },
 * });
 *
 * // Use in any LangChain agent
 * const agent = createReactAgent({ tools: [governed] });
 * ```
 */
export function governTool(
  tool: LangChainTool,
  options: GovernToolOptions
): GovernedTool {
  return new GovernedTool(tool, options);
}
