/**
 * ATP Policy Evaluation
 *
 * Local policy evaluation engine for ATP contracts (Spec Section 6).
 * Evaluates scope constraints against request parameters.
 */

import type { ATPContract, PolicyEvaluation, PolicyConstraint, PolicySource } from "../types";

export interface PolicyRule {
  source: PolicySource;
  field: string;
  type: ConstraintRuleType;
  value: unknown;
}

export type ConstraintRuleType =
  | "enumeration"
  | "numeric_max"
  | "numeric_min"
  | "pattern"
  | "temporal"
  | "boolean"
  | "deny_list"
  | "rate_limit"
  | "size_limit";

/**
 * Evaluate request parameters against a contract's scope constraints.
 *
 * This performs local policy evaluation (contract-level only).
 * Full policy evaluation with organization and template policies
 * requires a gateway connection.
 *
 * @example
 * ```typescript
 * import { evaluatePolicy } from "@atp-protocol/sdk";
 *
 * const result = evaluatePolicy(contract, {
 *   recipient: "user@approved-vendors.com",
 *   amount: 2500
 * });
 *
 * if (!result.permitted) {
 *   console.error("Policy violation:", result.denial_reason);
 * }
 * ```
 */
export function evaluatePolicy(
  contract: ATPContract,
  requestParams: Record<string, unknown>
): PolicyEvaluation {
  const constraints: PolicyConstraint[] = [];
  const now = new Date().toISOString();

  if (!contract.scope) {
    return {
      permitted: true,
      policies_evaluated: 0,
      constraints_applied: [],
      evaluated_at: now,
    };
  }

  const scope = contract.scope;
  let policiesEvaluated = 0;

  for (const [field, constraint] of Object.entries(scope)) {
    // Skip metadata fields
    if (field === "idempotency_ack") continue;

    policiesEvaluated++;
    const requestValue = requestParams[field];

    // Deny list (field name contains "prohibited") — must check before enumeration
    if (field.includes("prohibited") && Array.isArray(constraint)) {
      constraints.push({ source: "contract", field, value: constraint });

      if (requestValue !== undefined && typeof requestValue === "string") {
        const lower = requestValue.toLowerCase();
        for (const denied of constraint) {
          if (typeof denied === "string" && lower.includes(denied.toLowerCase())) {
            return {
              permitted: false,
              policies_evaluated: policiesEvaluated,
              constraints_applied: constraints,
              evaluated_at: now,
              denial_reason: `Content contains prohibited term: "${denied}"`,
              denial_source: "contract",
            };
          }
        }
      }
      continue;
    }

    // Enumeration constraint (array of permitted values)
    if (Array.isArray(constraint)) {
      constraints.push({ source: "contract", field, value: constraint });

      if (requestValue !== undefined) {
        const permitted = checkEnumeration(constraint, requestValue);
        if (!permitted) {
          return {
            permitted: false,
            policies_evaluated: policiesEvaluated,
            constraints_applied: constraints,
            evaluated_at: now,
            denial_reason: `Value for "${field}" is not in the permitted set`,
            denial_source: "contract",
          };
        }
      }
      continue;
    }

    // Numeric max constraint
    if (field.startsWith("max_") && typeof constraint === "number") {
      constraints.push({ source: "contract", field, value: constraint });

      if (requestValue !== undefined && typeof requestValue === "number") {
        if (requestValue > constraint) {
          return {
            permitted: false,
            policies_evaluated: policiesEvaluated,
            constraints_applied: constraints,
            evaluated_at: now,
            denial_reason: `Value for "${field}" (${requestValue}) exceeds maximum (${constraint})`,
            denial_source: "contract",
          };
        }
      }
      continue;
    }

    // Numeric min constraint
    if (field.startsWith("min_") && typeof constraint === "number") {
      constraints.push({ source: "contract", field, value: constraint });

      if (requestValue !== undefined && typeof requestValue === "number") {
        if (requestValue < constraint) {
          return {
            permitted: false,
            policies_evaluated: policiesEvaluated,
            constraints_applied: constraints,
            evaluated_at: now,
            denial_reason: `Value for "${field}" (${requestValue}) is below minimum (${constraint})`,
            denial_source: "contract",
          };
        }
      }
      continue;
    }

    // Boolean constraint
    if (typeof constraint === "boolean") {
      constraints.push({ source: "contract", field, value: constraint });

      if (constraint === false && requestValue) {
        return {
          permitted: false,
          policies_evaluated: policiesEvaluated,
          constraints_applied: constraints,
          evaluated_at: now,
          denial_reason: `"${field}" is not allowed by policy`,
          denial_source: "contract",
        };
      }
      continue;
    }

    // Pattern constraint (field name contains "pattern")
    if (field.includes("pattern") && typeof constraint === "string") {
      constraints.push({ source: "contract", field, value: constraint });

      if (requestValue !== undefined && typeof requestValue === "string") {
        try {
          const regex = new RegExp(constraint);
          if (!regex.test(requestValue)) {
            return {
              permitted: false,
              policies_evaluated: policiesEvaluated,
              constraints_applied: constraints,
              evaluated_at: now,
              denial_reason: `Value for "${field}" does not match required pattern`,
              denial_source: "contract",
            };
          }
        } catch {
          // Invalid regex in constraint — treat as error
          return {
            permitted: false,
            policies_evaluated: policiesEvaluated,
            constraints_applied: constraints,
            evaluated_at: now,
            denial_reason: `Invalid pattern constraint for "${field}"`,
            denial_source: "contract",
          };
        }
      }
      continue;
    }

    // Rate limit constraint (object with max and per)
    if (
      typeof constraint === "object" &&
      constraint !== null &&
      "max" in constraint &&
      "per" in constraint
    ) {
      constraints.push({ source: "contract", field, value: constraint });
      // Rate limit enforcement requires state — tracked by gateway, not local eval
      continue;
    }

    // Generic constraint — record but don't enforce locally
    constraints.push({ source: "contract", field, value: constraint });
  }

  return {
    permitted: true,
    policies_evaluated: policiesEvaluated,
    constraints_applied: constraints,
    evaluated_at: now,
  };
}

// ---------------------------------------------------------------------------
// Constraint merging (Spec Section 6.4)
// ---------------------------------------------------------------------------

/**
 * Merge multiple policy constraint sets, applying the most restrictive rule.
 * Used when combining organization, template, and contract policies.
 */
export function mergeConstraints(
  ...policySets: Array<Record<string, unknown>>
): Record<string, unknown> {
  const merged: Record<string, unknown> = {};

  for (const policies of policySets) {
    for (const [field, value] of Object.entries(policies)) {
      const existing = merged[field];

      if (existing === undefined) {
        merged[field] = value;
        continue;
      }

      // Enumerations: intersection
      if (Array.isArray(existing) && Array.isArray(value)) {
        const intersection = existing.filter((v) => value.includes(v));
        merged[field] = intersection;
        continue;
      }

      // Numeric max: take lowest
      if (field.startsWith("max_") && typeof existing === "number" && typeof value === "number") {
        merged[field] = Math.min(existing, value);
        continue;
      }

      // Numeric min: take highest
      if (field.startsWith("min_") && typeof existing === "number" && typeof value === "number") {
        merged[field] = Math.max(existing, value);
        continue;
      }

      // Boolean: false wins
      if (typeof existing === "boolean" && typeof value === "boolean") {
        merged[field] = existing && value;
        continue;
      }

      // Rate limit: lowest rate
      if (isRateLimit(existing) && isRateLimit(value)) {
        merged[field] = (existing as { max: number }).max <= (value as { max: number }).max
          ? existing
          : value;
        continue;
      }

      // Default: later policy wins (higher priority)
      merged[field] = value;
    }
  }

  return merged;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function checkEnumeration(permitted: unknown[], value: unknown): boolean {
  if (typeof value === "string") {
    // Support domain matching (e.g., "@approved-vendors.com" matches "user@approved-vendors.com")
    return permitted.some((p) => {
      if (typeof p === "string" && p.startsWith("@")) {
        return value.endsWith(p);
      }
      return p === value;
    });
  }
  return permitted.includes(value);
}

function isRateLimit(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    "max" in value &&
    "per" in value
  );
}
