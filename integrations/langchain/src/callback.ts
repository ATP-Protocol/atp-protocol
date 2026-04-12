/**
 * ATP Callback Handler for LangChain
 *
 * Logs ATP governance events into LangChain's callback system
 * for observability integration (LangSmith, LangFuse, etc.).
 */

import type { EvidenceRecord, PolicyEvaluation } from "@atp-protocol/sdk";

/**
 * ATP governance event types.
 */
export type ATPEvent =
  | { type: "atp:policy_evaluated"; tool: string; policy: PolicyEvaluation }
  | { type: "atp:denied"; tool: string; reason: string }
  | { type: "atp:executed"; tool: string; outcome: string }
  | { type: "atp:evidence_captured"; tool: string; evidence: EvidenceRecord };

/**
 * Callback handler that bridges ATP governance events into LangChain's
 * callback system for observability.
 *
 * @example
 * ```typescript
 * import { ATPCallbackHandler } from "@atp-protocol/langchain";
 *
 * const handler = new ATPCallbackHandler({
 *   onEvent: (event) => {
 *     // Send to LangSmith, LangFuse, or your own telemetry
 *     console.log(`[ATP] ${event.type}`, event);
 *   },
 * });
 *
 * // Attach to governed tools
 * const governed = governTool(myTool, {
 *   contract: myContract,
 *   onDenied: (reason, args) =>
 *     handler.handleEvent({
 *       type: "atp:denied",
 *       tool: myTool.name,
 *       reason,
 *     }),
 *   onEvidence: (record) =>
 *     handler.handleEvent({
 *       type: "atp:evidence_captured",
 *       tool: myTool.name,
 *       evidence: record,
 *     }),
 * });
 * ```
 */
export class ATPCallbackHandler {
  private onEvent: (event: ATPEvent) => void;
  private events: ATPEvent[] = [];
  private maxEvents: number;

  constructor(options: {
    onEvent?: (event: ATPEvent) => void;
    maxEvents?: number;
  } = {}) {
    this.onEvent = options.onEvent ?? (() => {});
    this.maxEvents = options.maxEvents ?? 1000;
  }

  /**
   * Handle an ATP governance event.
   */
  handleEvent(event: ATPEvent): void {
    this.events.push(event);
    if (this.events.length > this.maxEvents) {
      this.events.shift();
    }
    this.onEvent(event);
  }

  /**
   * Get all recorded events.
   */
  getEvents(): readonly ATPEvent[] {
    return this.events;
  }

  /**
   * Get events filtered by type.
   */
  getEventsByType<T extends ATPEvent["type"]>(
    type: T
  ): Extract<ATPEvent, { type: T }>[] {
    return this.events.filter(
      (e): e is Extract<ATPEvent, { type: T }> => e.type === type
    );
  }

  /**
   * Get a summary of governance activity.
   */
  summary(): {
    total: number;
    denied: number;
    executed: number;
    evidence_captured: number;
    by_tool: Record<string, { total: number; denied: number }>;
  } {
    const byTool: Record<string, { total: number; denied: number }> = {};

    let denied = 0;
    let executed = 0;
    let evidence_captured = 0;

    for (const event of this.events) {
      if (!byTool[event.tool]) {
        byTool[event.tool] = { total: 0, denied: 0 };
      }
      byTool[event.tool].total++;

      switch (event.type) {
        case "atp:denied":
          denied++;
          byTool[event.tool].denied++;
          break;
        case "atp:executed":
          executed++;
          break;
        case "atp:evidence_captured":
          evidence_captured++;
          break;
      }
    }

    return {
      total: this.events.length,
      denied,
      executed,
      evidence_captured,
      by_tool: byTool,
    };
  }

  /**
   * Clear all recorded events.
   */
  clear(): void {
    this.events.length = 0;
  }
}
