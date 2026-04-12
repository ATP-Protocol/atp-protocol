/**
 * Governed Toolkit — wrap multiple LangChain tools with shared ATP governance.
 */

import type { ATPContract, EvidenceRecord } from "@atp-protocol/sdk";
import type { EvidenceBackend } from "@atp-protocol/sdk/evidence";
import { GovernedTool } from "./governed-tool";
import type { GovernToolOptions } from "./governed-tool";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GovernedToolkitOptions {
  /** Shared contract applied to all tools (can be overridden per tool). */
  contract: ATPContract;
  /** Tools to govern. */
  tools: Array<{
    name: string;
    description: string;
    invoke(input: any, config?: any): Promise<string>;
    schema?: any;
  }>;
  /** Per-tool contract overrides (keyed by tool name). */
  contractOverrides?: Record<string, Partial<ATPContract>>;
  /** Shared wallet. */
  wallet?: string;
  /** Shared org ID. */
  org_id?: string;
  /** Shared evidence backend. */
  evidenceBackend?: EvidenceBackend;
  /** Shared gateway ID. */
  gateway_id?: string;
  /** Called when any tool is denied. */
  onDenied?: (toolName: string, reason: string) => void;
  /** Called when evidence is captured for any tool. */
  onEvidence?: (toolName: string, record: EvidenceRecord) => void;
}

// ---------------------------------------------------------------------------
// GovernedToolkit
// ---------------------------------------------------------------------------

/**
 * Govern a set of LangChain tools with a shared ATP contract.
 *
 * @example
 * ```typescript
 * import { GovernedToolkit } from "@atp-protocol/langchain";
 *
 * const toolkit = new GovernedToolkit({
 *   contract: sharedContract,
 *   tools: [searchTool, emailTool, dbTool],
 *   wallet: "0xAgent",
 *   org_id: "org_456",
 *   evidenceBackend: myBackend,
 *   contractOverrides: {
 *     "send-email": {
 *       approval: { required: true, approver_role: "manager" },
 *     },
 *   },
 * });
 *
 * // Use in any LangChain agent
 * const agent = createReactAgent({ tools: toolkit.tools() });
 * ```
 */
export class GovernedToolkit {
  private governed: GovernedTool[];
  private opts: GovernedToolkitOptions;

  constructor(options: GovernedToolkitOptions) {
    this.opts = options;
    this.governed = options.tools.map((tool) => {
      const override = options.contractOverrides?.[tool.name] ?? {};
      const contract: ATPContract = {
        ...options.contract,
        ...override,
        // Ensure actions includes this tool's name
        actions: override.actions ?? [
          ...options.contract.actions,
          ...(options.contract.actions.includes(tool.name) ? [] : [tool.name]),
        ],
      };

      const toolOpts: GovernToolOptions = {
        contract,
        wallet: options.wallet,
        org_id: options.org_id,
        evidenceBackend: options.evidenceBackend,
        gateway_id: options.gateway_id,
        onDenied: options.onDenied
          ? (reason) => options.onDenied!(tool.name, reason)
          : undefined,
        onEvidence: options.onEvidence
          ? (record) => options.onEvidence!(tool.name, record)
          : undefined,
      };

      return new GovernedTool(tool, toolOpts);
    });
  }

  /**
   * Get the governed tools for use in a LangChain agent.
   */
  tools(): GovernedTool[] {
    return this.governed;
  }

  /**
   * Get a specific governed tool by name.
   */
  tool(name: string): GovernedTool | undefined {
    return this.governed.find((t) => t.name === name);
  }

  /**
   * Get all tool names.
   */
  names(): string[] {
    return this.governed.map((t) => t.name);
  }
}
