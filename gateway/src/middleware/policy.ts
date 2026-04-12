/**
 * Policy Evaluation Middleware
 *
 * Evaluates scope constraints against request parameters (Spec Section 6).
 * Short-circuit evaluation — first failure terminates.
 */

import type { ATPContract } from "../types";

export interface PolicyResult {
  permitted: boolean;
  policies_evaluated: number;
  constraints_applied: Array<{ source: string; field: string; value: unknown }>;
  denial_reason?: string;
}

/**
 * Evaluate contract scope constraints against request parameters.
 */
export function evaluatePolicy(
  contract: ATPContract,
  requestParams: Record<string, unknown>
): PolicyResult {
  const constraints: Array<{ source: string; field: string; value: unknown }> = [];
  let evaluated = 0;

  if (!contract.scope) {
    return { permitted: true, policies_evaluated: 0, constraints_applied: [] };
  }

  for (const [field, constraint] of Object.entries(contract.scope)) {
    if (field === "idempotency_ack") continue;
    evaluated++;

    const value = requestParams[field];

    // Deny list
    if (field.includes("prohibited") && Array.isArray(constraint)) {
      constraints.push({ source: "contract", field, value: constraint });
      if (value !== undefined && typeof value === "string") {
        const lower = value.toLowerCase();
        for (const denied of constraint) {
          if (typeof denied === "string" && lower.includes(denied.toLowerCase())) {
            return {
              permitted: false,
              policies_evaluated: evaluated,
              constraints_applied: constraints,
              denial_reason: `Prohibited content: "${denied}"`,
            };
          }
        }
      }
      continue;
    }

    // Enumeration
    if (Array.isArray(constraint)) {
      constraints.push({ source: "contract", field, value: constraint });
      if (value !== undefined) {
        const match = constraint.some((c) => {
          if (typeof c === "string" && c.startsWith("@") && typeof value === "string") {
            return value.endsWith(c);
          }
          return c === value;
        });
        if (!match) {
          return {
            permitted: false,
            policies_evaluated: evaluated,
            constraints_applied: constraints,
            denial_reason: `"${field}" value not in permitted set`,
          };
        }
      }
      continue;
    }

    // Numeric max
    if (field.startsWith("max_") && typeof constraint === "number") {
      constraints.push({ source: "contract", field, value: constraint });
      if (typeof value === "number" && value > constraint) {
        return {
          permitted: false,
          policies_evaluated: evaluated,
          constraints_applied: constraints,
          denial_reason: `"${field}" (${value}) exceeds max (${constraint})`,
        };
      }
      continue;
    }

    // Numeric min
    if (field.startsWith("min_") && typeof constraint === "number") {
      constraints.push({ source: "contract", field, value: constraint });
      if (typeof value === "number" && value < constraint) {
        return {
          permitted: false,
          policies_evaluated: evaluated,
          constraints_applied: constraints,
          denial_reason: `"${field}" (${value}) below min (${constraint})`,
        };
      }
      continue;
    }

    // Boolean
    if (typeof constraint === "boolean") {
      constraints.push({ source: "contract", field, value: constraint });
      if (constraint === false && value) {
        return {
          permitted: false,
          policies_evaluated: evaluated,
          constraints_applied: constraints,
          denial_reason: `"${field}" is not permitted`,
        };
      }
      continue;
    }

    // Default: record
    constraints.push({ source: "contract", field, value: constraint });
  }

  return { permitted: true, policies_evaluated: evaluated, constraints_applied: constraints };
}
