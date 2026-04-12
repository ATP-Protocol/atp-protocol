/**
 * Reference ATP Implementation Adapter
 * Wraps the ATP SDK as a ConformanceTarget for testing
 * This serves as the reference that third parties compare against
 */

import { ConformanceTarget, ValidationResult, EvaluationResult, EvidenceResult } from "../types";

/**
 * Reference adapter implementing basic ATP operations
 * This is a minimal implementation showing how to adapt an ATP SDK to the conformance interface
 */
export class ReferenceAtpAdapter implements ConformanceTarget {
  private executionCounter = 0;
  private evidenceCounter = 0;

  /**
   * Validate an ATP contract against the canonical schema
   */
  validateContract(contract: unknown): ValidationResult {
    const errors: Array<{ field: string; code: string }> = [];

    if (!contract || typeof contract !== "object") {
      return { valid: false, errors: [{ field: "contract", code: "not_object" }] };
    }

    const c = contract as Record<string, unknown>;

    // Check required fields
    if (c.version === undefined || c.version === null) {
      errors.push({ field: "version", code: "required" });
    } else if (typeof c.version !== "string") {
      errors.push({ field: "version", code: "type_error" });
    } else if (c.version === "") {
      errors.push({ field: "version", code: "invalid_format" });
    }

    if (c.authority === undefined || c.authority === null) {
      errors.push({ field: "authority", code: "required" });
    } else if (typeof c.authority !== "string") {
      errors.push({ field: "authority", code: "type_error" });
    } else if (c.authority === "") {
      errors.push({ field: "authority", code: "invalid_format" });
    }

    if (c.actions === undefined || c.actions === null) {
      errors.push({ field: "actions", code: "required" });
    } else if (!Array.isArray(c.actions)) {
      errors.push({ field: "actions", code: "type_error" });
    } else if (c.actions.length === 0) {
      errors.push({ field: "actions", code: "min_items" });
    }

    if (c.attestation === undefined || c.attestation === null) {
      errors.push({ field: "attestation", code: "required" });
    } else if (typeof c.attestation !== "string") {
      errors.push({ field: "attestation", code: "type_error" });
    } else if (!["full", "light", "none"].includes(c.attestation)) {
      errors.push({ field: "attestation", code: "invalid_value" });
    }

    // Validate optional attestation.level (old format)
    if (typeof c.attestation === "object") {
      const attest = c.attestation as Record<string, unknown>;
      if (attest.level && !["full", "light", "none"].includes(attest.level as string)) {
        errors.push({ field: "attestation", code: "type_error" });
      }
    }

    // Validate expiry if present
    if (c.expiry) {
      if (typeof c.expiry !== "string") {
        errors.push({ field: "expiry", code: "type_error" });
      } else {
        try {
          const expiryDate = new Date(c.expiry);
          if (isNaN(expiryDate.getTime())) {
            errors.push({ field: "expiry", code: "invalid_iso8601" });
          } else if (expiryDate < new Date()) {
            errors.push({ field: "expiry", code: "must_be_future" });
          }
        } catch {
          errors.push({ field: "expiry", code: "invalid_iso8601" });
        }
      }
    }

    // Validate approval timeout if present
    if (c.approval && typeof c.approval === "object") {
      const approval = c.approval as Record<string, unknown>;
      if (approval.timeout) {
        if (typeof approval.timeout !== "string" || !this.isValidISO8601Duration(approval.timeout)) {
          errors.push({ field: "approval.timeout", code: "invalid_iso8601_duration" });
        }
      }
    }

    // Validate delegation max_depth
    if (c.delegation && typeof c.delegation === "object") {
      const delegation = c.delegation as Record<string, unknown>;
      if (delegation.max_depth !== undefined) {
        if (typeof delegation.max_depth !== "number") {
          errors.push({ field: "delegation.max_depth", code: "type_error" });
        } else if (delegation.max_depth < 0) {
          errors.push({ field: "delegation.max_depth", code: "minimum" });
        }
      }
    }

    // Validate idempotency model
    if (c.scope && typeof c.scope === "object") {
      const scope = c.scope as Record<string, unknown>;
      if (scope.idempotency_model) {
        if (!["gateway-enforced", "tool-native", "unsafe"].includes(scope.idempotency_model as string)) {
          errors.push({ field: "scope.idempotency_model", code: "invalid_value" });
        }
        // unsafe requires idempotency_ack
        if (scope.idempotency_model === "unsafe" && !scope.idempotency_ack) {
          errors.push({ field: "scope", code: "idempotency_ack_required" });
        }
      }
    }

    // Validate credentials inject_as
    if (c.credentials && typeof c.credentials === "object") {
      const creds = c.credentials as Record<string, unknown>;
      if (creds.inject_as) {
        if (!["oauth_token", "api_key", "bearer_token", "basic_auth", "custom"].includes(creds.inject_as as string)) {
          errors.push({ field: "credentials.inject_as", code: "invalid_value" });
        }
      }
    }

    // Additional validation: if attestation has nested level field, check it
    if (typeof c.attestation === "object" && c.attestation) {
      const attest = c.attestation as Record<string, unknown>;
      if (attest.level && !["full", "light", "none"].includes(attest.level as string)) {
        errors.push({ field: "attestation.level", code: "invalid_value" });
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Evaluate a policy against execution parameters
   */
  evaluatePolicy(contract: object, params: Record<string, unknown>): EvaluationResult {
    const c = contract as Record<string, unknown>;
    const scope = c.scope as Record<string, unknown> | undefined;

    // If no scope, permit everything
    if (!scope) {
      return { permitted: true };
    }

    // Evaluate enumeration constraints
    for (const [key, value] of Object.entries(scope)) {
      if (Array.isArray(value) && !key.startsWith("prohibited_")) {
        const paramValue = params[key];
        if (paramValue !== undefined && !value.includes(paramValue)) {
          return { permitted: false, denial_reason: "constraint_violated" };
        }
      }
    }

    // Also check allowed_recipients specifically (may use domain matching)
    if (scope.allowed_recipients && Array.isArray(scope.allowed_recipients)) {
      const recipient = params.recipient as string | undefined;
      if (recipient) {
        const allowed = scope.allowed_recipients as string[];
        let recipientAllowed = false;

        // Check exact match or domain match
        for (const pattern of allowed) {
          if (pattern === recipient) {
            recipientAllowed = true;
            break;
          }
          // If pattern looks like a domain (@something), try domain matching
          if (pattern.startsWith("@") && recipient.includes("@")) {
            if (this.matchesDomain(recipient, pattern)) {
              recipientAllowed = true;
              break;
            }
          }
        }

        if (!recipientAllowed) {
          return { permitted: false, denial_reason: "constraint_violated" };
        }
      }
    }

    // Evaluate numeric constraints
    if (scope.max_amount && typeof scope.max_amount === "number") {
      const amount = params.amount as number | undefined;
      if (amount !== undefined && amount > scope.max_amount) {
        return { permitted: false, denial_reason: "constraint_violated" };
      }
    }

    if (scope.min_amount && typeof scope.min_amount === "number") {
      const amount = params.amount as number | undefined;
      if (amount !== undefined && amount < scope.min_amount) {
        return { permitted: false, denial_reason: "constraint_violated" };
      }
    }

    // Evaluate domain constraints
    if (scope.allowed_domain && typeof scope.allowed_domain === "string") {
      const email = params.email as string | undefined;
      if (email) {
        if (!this.matchesDomain(email, scope.allowed_domain)) {
          return { permitted: false, denial_reason: "constraint_violated" };
        }
      }
    }

    // Evaluate deny list
    if (scope.prohibited_keywords && Array.isArray(scope.prohibited_keywords)) {
      const subject = params.subject as string | undefined;
      if (subject) {
        for (const keyword of scope.prohibited_keywords) {
          if (subject.includes(keyword)) {
            return { permitted: false, denial_reason: "constraint_violated" };
          }
        }
      }
    }

    // Evaluate pattern constraints
    if (scope.subject_pattern && typeof scope.subject_pattern === "string") {
      try {
        const pattern = new RegExp(scope.subject_pattern);
        const subject = params.subject as string | undefined;
        if (subject && !pattern.test(subject)) {
          return { permitted: false, denial_reason: "constraint_violated" };
        }
      } catch {
        return { permitted: false, denial_reason: "invalid_constraint" };
      }
    }

    // Evaluate temporal constraints
    if (scope.execution_window && typeof scope.execution_window === "object") {
      const window = scope.execution_window as Record<string, unknown>;
      const execTime = params.execution_time as string | undefined;
      if (execTime) {
        const timeStr = execTime.split("T")[1] || execTime;
        const after = window.after as string | undefined;
        const before = window.before as string | undefined;
        if (after && timeStr < after) {
          return { permitted: false, denial_reason: "constraint_violated" };
        }
        if (before && timeStr >= before) {
          return { permitted: false, denial_reason: "constraint_violated" };
        }
      }
    }

    // Evaluate boolean constraints
    if (scope.allow_attachments !== undefined && typeof scope.allow_attachments === "boolean") {
      const hasAttachments = params.has_attachments as boolean | undefined;
      if (hasAttachments && !scope.allow_attachments) {
        return { permitted: false, denial_reason: "constraint_violated" };
      }
    }

    if (scope.allow_external !== undefined && typeof scope.allow_external === "boolean") {
      const external = params.external as boolean | undefined;
      if (external && !scope.allow_external) {
        return { permitted: false, denial_reason: "constraint_violated" };
      }
    }

    // Handle compound numeric constraints (tightest bound wins)
    const maxKeys = Object.keys(scope).filter((k) => k.startsWith("max_"));
    if (maxKeys.length > 1) {
      const amount = params.amount as number | undefined;
      if (amount !== undefined) {
        let maxBound = Infinity;
        for (const key of maxKeys) {
          const val = scope[key];
          if (typeof val === "number" && val < maxBound) {
            maxBound = val;
          }
        }
        if (amount > maxBound) {
          return { permitted: false, denial_reason: "constraint_violated" };
        }
      }
    }

    return { permitted: true };
  }

  /**
   * Transition the approval state machine
   */
  transitionApproval(state: string, trigger: string): { next_state: string } | { error: string } {
    const transitions: Record<string, Record<string, string>> = {
      REQUESTED: {
        submit: "PENDING_REVIEW",
        revoke: "REVOKED",
      },
      PENDING_REVIEW: {
        approve: "APPROVED",
        deny: "DENIED",
        timeout: "EXPIRED",
        revoke: "REVOKED",
      },
      EXPIRED: {
        escalate: "ESCALATED",
        deny_timeout: "DENIED_TIMEOUT",
        revoke: "REVOKED",
      },
      ESCALATED: {
        resubmit: "PENDING_REVIEW",
        revoke: "REVOKED",
      },
      APPROVED: {
        revoke: "REVOKED",
      },
      DENIED: {
        revoke: "REVOKED",
      },
      DENIED_TIMEOUT: {
        revoke: "REVOKED",
      },
      REVOKED: {},
    };

    const validTransitions = transitions[state];
    if (!validTransitions) {
      return { error: "invalid_state" };
    }

    const nextState = validTransitions[trigger];
    if (!nextState) {
      return { error: "invalid_transition" };
    }

    return { next_state: nextState };
  }

  /**
   * Capture an evidence record
   */
  captureEvidence(input: object): EvidenceResult & Record<string, unknown> {
    const evidence = input as Record<string, unknown>;

    const evidenceId = `evt_${String(++this.evidenceCounter).padStart(6, "0")}`;
    const executionId =
      (evidence.execution_id as string) || `exe_${String(++this.executionCounter).padStart(6, "0")}`;

    // Return all input fields plus generated IDs
    // This ensures evidence records contain all context passed in
    return {
      ...evidence,
      evidence_id: evidenceId,
      execution_id: executionId,
      request_hash: evidence.request_hash as string,
    } as EvidenceResult & Record<string, unknown>;
  }

  /**
   * Compute deterministic idempotency key from contract, action, and params
   */
  computeIdempotencyKey(contractId: string, action: string, params: object): string {
    // Simple deterministic key based on inputs
    // In production, this would use HMAC-SHA256
    const canonical = JSON.stringify(
      {
        contract_id: contractId,
        action,
        params: this.canonicalizeParams(params),
      },
      Object.keys({
        contract_id: contractId,
        action,
        params: this.canonicalizeParams(params),
      }).sort()
    );

    // Simple hash (in production use crypto.createHmac)
    let hash = 0;
    for (let i = 0; i < canonical.length; i++) {
      const char = canonical.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }

    return `idk_${Math.abs(hash).toString(16).padStart(16, "0")}`;
  }

  /**
   * Classify the outcome of an execution based on response
   */
  classifyOutcome(response: { status: number | null; body?: unknown; connection_reset?: boolean; ambiguous?: boolean; timeout?: boolean }): string {
    // Check for timeout (no response after delay)
    if (response.timeout === true) {
      return "timeout";
    }

    // Check for connection reset (unknown)
    if (response.connection_reset === true) {
      return "unknown";
    }

    // Check for ambiguous response
    if (response.ambiguous === true) {
      return "unknown";
    }

    // No response (null/undefined) = unknown (not resolved)
    if (response.status === null || response.status === undefined) {
      return "unknown";
    }

    // 202 Accepted with no final status = unknown
    if (response.status === 202) {
      return "unknown";
    }

    // Check for partial success indicator in body
    const body = response.body as Record<string, unknown> | undefined;
    if (body && body.partial === true) {
      return "partial";
    }

    // 2xx = success
    if (response.status >= 200 && response.status < 300) {
      return "success";
    }

    // 4xx or 5xx = failure
    if (response.status >= 400) {
      return "failure";
    }

    return "unknown";
  }

  // ============ Helper Methods ============

  private isValidISO8601Duration(duration: string): boolean {
    // Simple validation: should match PT or P patterns
    return /^P(\d+D)?(T(\d+H)?(\d+M)?(\d+S)?)?$|^PT\d+[HMS]$/.test(duration);
  }

  private matchesDomain(email: string, pattern: string): boolean {
    const domain = email.split("@")[1];
    if (!domain) return false;

    // Exact match
    if (pattern.startsWith("@")) {
      const patternDomain = pattern.substring(1);
      if (pattern.startsWith("@*.")) {
        // Suffix match (*.example.com matches sub.example.com but not example.com)
        const suffix = patternDomain.substring(2);
        return domain === suffix || domain.endsWith("." + suffix);
      }
      return domain === patternDomain;
    }

    return domain === pattern;
  }

  private canonicalizeParams(params: unknown): unknown {
    if (!params) return params;
    if (Array.isArray(params)) {
      return params.map((p) => this.canonicalizeParams(p));
    }
    if (typeof params !== "object") {
      return params;
    }

    // Sort object keys for canonical form
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(params as Record<string, unknown>).sort()) {
      const value = (params as Record<string, unknown>)[key];
      sorted[key] = typeof value === "object" ? this.canonicalizeParams(value) : value;
    }
    return sorted;
  }
}

/**
 * Factory function to create a reference adapter
 */
export function createReferenceAdapter(): ConformanceTarget {
  return new ReferenceAtpAdapter();
}
