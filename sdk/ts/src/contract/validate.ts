/**
 * ATP Contract Validation
 *
 * Validates ATP execution contracts against the spec (Section 4).
 * This module provides local validation without requiring a gateway connection.
 */

import type { ATPContract, AttestationLevel, IdempotencyModel, CredentialInjectionMethod } from "../types";

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

export interface ValidationWarning {
  field: string;
  message: string;
  code: string;
}

const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/;
const AUTHORITY_PATTERN = /^org\..+\..+$/;
const ISO_DURATION_PATTERN = /^P/;
const VALID_ATTESTATION_LEVELS: AttestationLevel[] = ["full", "light", "none"];
const VALID_IDEMPOTENCY_MODELS: IdempotencyModel[] = ["gateway-enforced", "tool-native", "unsafe"];
const VALID_INJECTION_METHODS: CredentialInjectionMethod[] = [
  "oauth_token", "api_key", "bearer_token", "basic_auth", "custom"
];

/**
 * Validate an ATP execution contract.
 *
 * Checks required fields, field formats, and cross-field consistency.
 * Returns errors (invalid contract) and warnings (valid but potentially problematic).
 *
 * @example
 * ```typescript
 * import { validateContract } from "@atp-protocol/sdk";
 *
 * const result = validateContract(myContract);
 * if (!result.valid) {
 *   console.error("Contract invalid:", result.errors);
 * }
 * ```
 */
export function validateContract(contract: unknown): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  if (!contract || typeof contract !== "object") {
    errors.push({
      field: "(root)",
      message: "Contract must be a non-null object",
      code: "INVALID_TYPE",
    });
    return { valid: false, errors, warnings };
  }

  const c = contract as Record<string, unknown>;

  // Required fields
  validateRequired(c, "version", errors);
  validateRequired(c, "authority", errors);
  validateRequired(c, "actions", errors);
  validateRequired(c, "attestation", errors);

  // Version format
  if (typeof c.version === "string" && !SEMVER_PATTERN.test(c.version)) {
    errors.push({
      field: "version",
      message: `Version must be semver format (got "${c.version}")`,
      code: "INVALID_VERSION",
    });
  }

  // Authority format
  if (typeof c.authority === "string" && !AUTHORITY_PATTERN.test(c.authority)) {
    errors.push({
      field: "authority",
      message: `Authority must match org.{domain}.{permission} format (got "${c.authority}")`,
      code: "INVALID_AUTHORITY",
    });
  }

  // Actions array
  if (Array.isArray(c.actions)) {
    if (c.actions.length === 0) {
      errors.push({
        field: "actions",
        message: "Actions array must have at least one item",
        code: "EMPTY_ACTIONS",
      });
    }
    for (let i = 0; i < c.actions.length; i++) {
      if (typeof c.actions[i] !== "string") {
        errors.push({
          field: `actions[${i}]`,
          message: "Each action must be a string",
          code: "INVALID_ACTION_TYPE",
        });
      }
    }
  } else if (c.actions !== undefined) {
    errors.push({
      field: "actions",
      message: "Actions must be an array",
      code: "INVALID_ACTIONS_TYPE",
    });
  }

  // Attestation
  if (typeof c.attestation === "string") {
    if (!VALID_ATTESTATION_LEVELS.includes(c.attestation as AttestationLevel)) {
      errors.push({
        field: "attestation",
        message: `Attestation must be one of: ${VALID_ATTESTATION_LEVELS.join(", ")}`,
        code: "INVALID_ATTESTATION",
      });
    }
    if (c.attestation === "none") {
      warnings.push({
        field: "attestation",
        message: "Attestation 'none' is only permitted in development. Production contracts MUST use 'full' or 'light'.",
        code: "DEV_ONLY_ATTESTATION",
      });
    }
  }

  // Idempotency
  if (c.idempotency !== undefined) {
    if (!VALID_IDEMPOTENCY_MODELS.includes(c.idempotency as IdempotencyModel)) {
      errors.push({
        field: "idempotency",
        message: `Idempotency must be one of: ${VALID_IDEMPOTENCY_MODELS.join(", ")}`,
        code: "INVALID_IDEMPOTENCY",
      });
    }
    if (c.idempotency === "unsafe") {
      const scope = c.scope as Record<string, unknown> | undefined;
      if (!scope?.idempotency_ack) {
        errors.push({
          field: "idempotency",
          message: "Contracts with idempotency 'unsafe' require scope.idempotency_ack = true",
          code: "MISSING_IDEMPOTENCY_ACK",
        });
      }
      warnings.push({
        field: "idempotency",
        message: "Idempotency 'unsafe' means retries may cause duplicate side effects.",
        code: "UNSAFE_IDEMPOTENCY",
      });
    }
  }

  // Approval config
  if (c.approval !== undefined && typeof c.approval === "object" && c.approval !== null) {
    const approval = c.approval as Record<string, unknown>;
    if (approval.timeout !== undefined) {
      if (typeof approval.timeout !== "string" || !ISO_DURATION_PATTERN.test(approval.timeout)) {
        errors.push({
          field: "approval.timeout",
          message: "Approval timeout must be an ISO 8601 duration (starting with P)",
          code: "INVALID_APPROVAL_TIMEOUT",
        });
      }
    }
    if (approval.required === true && !approval.approver_role) {
      warnings.push({
        field: "approval.approver_role",
        message: "Approval is required but no approver_role is specified. The gateway must have a default.",
        code: "MISSING_APPROVER_ROLE",
      });
    }
  }

  // Credentials config
  if (c.credentials !== undefined && typeof c.credentials === "object" && c.credentials !== null) {
    const creds = c.credentials as Record<string, unknown>;
    if (creds.inject_as !== undefined) {
      if (!VALID_INJECTION_METHODS.includes(creds.inject_as as CredentialInjectionMethod)) {
        errors.push({
          field: "credentials.inject_as",
          message: `inject_as must be one of: ${VALID_INJECTION_METHODS.join(", ")}`,
          code: "INVALID_INJECTION_METHOD",
        });
      }
    }
    if (creds.fail_closed === false) {
      warnings.push({
        field: "credentials.fail_closed",
        message: "fail_closed is false. This is only permitted in development. Production contracts MUST use fail_closed: true.",
        code: "DEV_ONLY_FAIL_OPEN",
      });
    }
  }

  // Expiry
  if (c.expiry !== undefined) {
    if (typeof c.expiry === "string") {
      const expiryDate = new Date(c.expiry);
      if (isNaN(expiryDate.getTime())) {
        errors.push({
          field: "expiry",
          message: "Expiry must be a valid ISO 8601 datetime",
          code: "INVALID_EXPIRY",
        });
      } else if (expiryDate.getTime() < Date.now()) {
        warnings.push({
          field: "expiry",
          message: "Contract expiry is in the past",
          code: "EXPIRED_CONTRACT",
        });
      }
    }
  }

  // Execution timeout
  if (c.execution_timeout !== undefined) {
    if (typeof c.execution_timeout !== "string" || !ISO_DURATION_PATTERN.test(c.execution_timeout)) {
      errors.push({
        field: "execution_timeout",
        message: "Execution timeout must be an ISO 8601 duration",
        code: "INVALID_EXECUTION_TIMEOUT",
      });
    }
  }

  // Delegation
  if (c.delegation !== undefined && typeof c.delegation === "object" && c.delegation !== null) {
    const delegation = c.delegation as Record<string, unknown>;
    if (delegation.max_depth !== undefined) {
      if (typeof delegation.max_depth !== "number" || delegation.max_depth < 0 || delegation.max_depth > 5) {
        errors.push({
          field: "delegation.max_depth",
          message: "Delegation max_depth must be 0-5",
          code: "INVALID_DELEGATION_DEPTH",
        });
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Check if a contract is expired.
 */
export function isContractExpired(contract: ATPContract): boolean {
  if (!contract.expiry) return false;
  return new Date(contract.expiry).getTime() < Date.now();
}

/**
 * Check if a contract requires approval for a given amount.
 */
export function requiresApproval(contract: ATPContract, amount?: number): boolean {
  if (!contract.approval?.required) return false;
  if (contract.approval.required_above === null || contract.approval.required_above === undefined) {
    return true; // Always required
  }
  if (amount === undefined) return false;
  return amount > contract.approval.required_above;
}

/**
 * Parse the escalation path into an ordered list of roles.
 */
export function parseEscalationPath(contract: ATPContract): string[] {
  if (!contract.approval?.escalation_path) return [];
  return contract.approval.escalation_path.split(",").map((r) => r.trim()).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function validateRequired(obj: Record<string, unknown>, field: string, errors: ValidationError[]): void {
  if (obj[field] === undefined || obj[field] === null) {
    errors.push({
      field,
      message: `Required field "${field}" is missing`,
      code: "MISSING_REQUIRED",
    });
  }
}
