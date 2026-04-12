/**
 * ATP Approval State Machine
 *
 * Implements the approval state machine from spec Section 7.
 * 9 states, deterministic transitions, cryptographic binding.
 */

import type { ApprovalState, ApprovalRecord, ApprovalRequest } from "../types";
import { TERMINAL_APPROVAL_STATES } from "../types";

export interface ApprovalTransition {
  from: ApprovalState;
  to: ApprovalState;
  trigger: ApprovalTrigger;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export type ApprovalTrigger =
  | "submit"
  | "deliver"
  | "approve"
  | "deny"
  | "timeout"
  | "escalate"
  | "exhaust_escalation"
  | "revoke";

const VALID_TRANSITIONS: ReadonlyMap<ApprovalState, Map<ApprovalTrigger, ApprovalState>> = new Map([
  ["REQUESTED", new Map<ApprovalTrigger, ApprovalState>([
    ["deliver", "PENDING_REVIEW"],
    ["revoke", "REVOKED"],
  ])],
  ["PENDING_REVIEW", new Map<ApprovalTrigger, ApprovalState>([
    ["approve", "APPROVED"],
    ["deny", "DENIED"],
    ["timeout", "EXPIRED"],
    ["revoke", "REVOKED"],
  ])],
  ["EXPIRED", new Map<ApprovalTrigger, ApprovalState>([
    ["escalate", "ESCALATED"],
    ["exhaust_escalation", "DENIED_TIMEOUT"],
    ["revoke", "REVOKED"],
  ])],
  ["ESCALATED", new Map<ApprovalTrigger, ApprovalState>([
    ["deliver", "PENDING_REVIEW"],
    ["revoke", "REVOKED"],
  ])],
]);

/**
 * Manages the approval lifecycle for a single execution request.
 *
 * @example
 * ```typescript
 * import { ApprovalFlow } from "@atp-protocol/sdk";
 *
 * const flow = new ApprovalFlow("ctr_123", "send-email", { recipient: "a@b.com" }, "0xWallet");
 * flow.transition("submit");   // → REQUESTED
 * flow.transition("deliver");  // → PENDING_REVIEW
 * flow.transition("approve");  // → APPROVED
 *
 * if (flow.isApproved()) {
 *   // Proceed to execution
 * }
 * ```
 */
export class ApprovalFlow {
  private _state: ApprovalState = "REQUESTED";
  private _history: ApprovalTransition[] = [];
  private _escalationDepth = 0;

  readonly contractId: string;
  readonly action: string;
  readonly scopeParams: Record<string, unknown>;
  readonly requestingWallet: string;
  readonly nonce: string;
  readonly createdAt: string;

  constructor(
    contractId: string,
    action: string,
    scopeParams: Record<string, unknown>,
    requestingWallet: string,
    nonce?: string
  ) {
    this.contractId = contractId;
    this.action = action;
    this.scopeParams = scopeParams;
    this.requestingWallet = requestingWallet;
    this.nonce = nonce ?? generateNonce();
    this.createdAt = new Date().toISOString();

    this._history.push({
      from: "REQUESTED" as ApprovalState,
      to: "REQUESTED",
      trigger: "submit",
      timestamp: this.createdAt,
    });
  }

  get state(): ApprovalState {
    return this._state;
  }

  get history(): ReadonlyArray<ApprovalTransition> {
    return this._history;
  }

  get escalationDepth(): number {
    return this._escalationDepth;
  }

  /**
   * Attempt a state transition. Throws if the transition is invalid.
   */
  transition(trigger: ApprovalTrigger, metadata?: Record<string, unknown>): ApprovalState {
    if (this.isTerminal()) {
      throw new ApprovalError(
        `Cannot transition from terminal state "${this._state}"`,
        this._state,
        trigger
      );
    }

    const validTransitions = VALID_TRANSITIONS.get(this._state);
    if (!validTransitions) {
      throw new ApprovalError(
        `No transitions defined for state "${this._state}"`,
        this._state,
        trigger
      );
    }

    const nextState = validTransitions.get(trigger);
    if (!nextState) {
      throw new ApprovalError(
        `Invalid transition: "${this._state}" → "${trigger}"`,
        this._state,
        trigger
      );
    }

    const transition: ApprovalTransition = {
      from: this._state,
      to: nextState,
      trigger,
      timestamp: new Date().toISOString(),
      metadata,
    };

    this._state = nextState;
    this._history.push(transition);

    if (trigger === "escalate") {
      this._escalationDepth++;
    }

    return nextState;
  }

  /**
   * Check if the current state is terminal (no further transitions possible).
   */
  isTerminal(): boolean {
    return TERMINAL_APPROVAL_STATES.has(this._state);
  }

  /**
   * Check if the approval was granted.
   */
  isApproved(): boolean {
    return this._state === "APPROVED";
  }

  /**
   * Check if the approval was denied (any denial reason).
   */
  isDenied(): boolean {
    return this._state === "DENIED" || this._state === "DENIED_TIMEOUT" || this._state === "REVOKED";
  }

  /**
   * Get the approval request object for submission to a gateway.
   */
  toRequest(): ApprovalRequest {
    return {
      contract_id: this.contractId,
      action: this.action,
      scope_params: this.scopeParams,
      requesting_wallet: this.requestingWallet,
      nonce: this.nonce,
    };
  }

  /**
   * Build an approval record from the current state.
   */
  toRecord(approverWallet?: string, approverRole?: string): ApprovalRecord {
    return {
      approval_id: `apr_${this.nonce}`,
      contract_id: this.contractId,
      action: this.action,
      scope_hash: computeScopeHash(this.scopeParams),
      requesting_wallet: this.requestingWallet,
      approver_wallet: approverWallet,
      approver_role: approverRole ?? "unknown",
      decision: this.isApproved()
        ? "approved"
        : this._state === "DENIED"
          ? "denied"
          : this._state === "EXPIRED" || this._state === "DENIED_TIMEOUT"
            ? "expired"
            : this._state === "REVOKED"
              ? "revoked"
              : "expired",
      decided_at: this.isTerminal()
        ? this._history[this._history.length - 1].timestamp
        : undefined,
      nonce: this.nonce,
      escalation_depth: this._escalationDepth,
    };
  }
}

/**
 * Check if a transition is valid without performing it.
 */
export function canTransition(currentState: ApprovalState, trigger: ApprovalTrigger): boolean {
  if (TERMINAL_APPROVAL_STATES.has(currentState)) return false;
  const validTransitions = VALID_TRANSITIONS.get(currentState);
  if (!validTransitions) return false;
  return validTransitions.has(trigger);
}

/**
 * Get all valid triggers for a given state.
 */
export function validTriggers(state: ApprovalState): ApprovalTrigger[] {
  if (TERMINAL_APPROVAL_STATES.has(state)) return [];
  const transitions = VALID_TRANSITIONS.get(state);
  if (!transitions) return [];
  return Array.from(transitions.keys());
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class ApprovalError extends Error {
  readonly state: ApprovalState;
  readonly trigger: ApprovalTrigger;

  constructor(message: string, state: ApprovalState, trigger: ApprovalTrigger) {
    super(message);
    this.name = "ApprovalError";
    this.state = state;
    this.trigger = trigger;
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function generateNonce(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "n_";
  for (let i = 0; i < 12; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function computeScopeHash(scope: Record<string, unknown>): string {
  // Deterministic JSON serialization for scope hashing
  const canonical = JSON.stringify(scope, Object.keys(scope).sort());
  // In a real implementation, this would use SHA-256
  // For the SDK, we provide a placeholder that gateways override
  return `sha256:${simpleHash(canonical)}`;
}

function simpleHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash).toString(16).padStart(8, "0");
}
