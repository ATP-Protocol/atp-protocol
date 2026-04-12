/**
 * ATP Conformance Test Suite Types
 * Defines the interface that implementations must satisfy and the report structure.
 */

/**
 * ConformanceTarget: Interface that any ATP implementation must satisfy
 * Implementations can be partial (e.g., only Level 1) or full (all levels)
 */
export interface ConformanceTarget {
  // ===== LEVEL 1: AWARE =====
  // Contract parsing and validation

  /**
   * Validate an ATP contract against the canonical schema
   * @param contract Unknown object to validate
   * @returns Validation result with any errors
   */
  validateContract(contract: unknown): ValidationResult;

  // ===== LEVEL 2: COMPATIBLE =====
  // Policy evaluation and approval state machine

  /**
   * Evaluate a policy against execution parameters
   * @param contract The ATP contract (validated)
   * @param params Execution parameters to evaluate against policy
   * @returns Permit or deny with optional denial reason
   */
  evaluatePolicy(
    contract: object,
    params: Record<string, unknown>
  ): EvaluationResult;

  /**
   * Transition the approval state machine
   * @param state Current approval state
   * @param trigger Trigger event (REQUESTED, APPROVED, DENIED, REVOKED, etc.)
   * @returns Next state or error
   */
  transitionApproval(
    state: string,
    trigger: string
  ): { next_state: string } | { error: string };

  // ===== LEVEL 3: VERIFIED =====
  // Evidence capture, idempotency, outcome classification

  /**
   * Capture an evidence record
   * @param input Evidence input data
   * @returns Evidence record with ID and hashes
   */
  captureEvidence?(input: object): EvidenceResult;

  /**
   * Compute deterministic idempotency key from contract, action, and params
   * @param contractId Contract ID
   * @param action Action name
   * @param params Action parameters
   * @returns HMAC-SHA256 computed key
   */
  computeIdempotencyKey?(
    contractId: string,
    action: string,
    params: object
  ): string;

  /**
   * Classify the outcome of an execution based on response
   * @param response HTTP response-like object with status and optional body
   * @returns Outcome classification (success, failure, timeout, unknown)
   */
  classifyOutcome?(response: { status: number; body?: unknown }): string;

  // ===== LEVEL 4: ATTESTED =====
  // DUAL network integration and evidence anchoring

  /**
   * Anchor evidence record on DUAL network
   * @param evidenceId Evidence ID to anchor
   * @returns Transaction hash and block number
   */
  anchorEvidence?(evidenceId: string): Promise<AnchorResult>;
}

/**
 * Result of contract validation
 */
export interface ValidationResult {
  valid: boolean;
  errors: Array<{
    field: string;
    code: string;
  }>;
}

/**
 * Result of policy evaluation
 */
export interface EvaluationResult {
  permitted: boolean;
  denial_reason?: string;
}

/**
 * Result of evidence capture
 */
export interface EvidenceResult {
  evidence_id: string;
  execution_id: string;
  request_hash: string;
}

/**
 * Result of DUAL anchoring
 */
export interface AnchorResult {
  tx_hash: string;
  block: number;
}

/**
 * Individual test result
 */
export interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration_ms: number;
}

/**
 * Results for a single conformance level
 */
export interface LevelResults {
  passed: number;
  failed: number;
  tests: TestResult[];
}

/**
 * Complete conformance report
 */
export interface ConformanceReport {
  target_name: string;
  atp_version: string;
  suite_version: string;
  tested_at: string;
  level_achieved: "none" | "aware" | "compatible" | "verified" | "attested";
  results: {
    aware: LevelResults;
    compatible: LevelResults;
    verified: LevelResults;
    attested: LevelResults;
  };
}

/**
 * Contract fixture for testing
 */
export interface ContractFixture {
  description: string;
  contract: unknown;
  expected_valid: boolean;
  expected_errors?: Array<{ field: string; code: string }>;
}

/**
 * Policy evaluation test fixture
 */
export interface PolicyFixture {
  description: string;
  contract: object;
  params: Record<string, unknown>;
  expected_permitted: boolean;
  expected_denial_reason?: string;
}

/**
 * Approval state machine test fixture
 */
export interface ApprovalFixture {
  description: string;
  transitions: Array<{
    state: string;
    trigger: string;
    expected_next_state?: string;
    expected_error?: string;
  }>;
}

/**
 * Evidence test fixture
 */
export interface EvidenceFixture {
  description: string;
  input: object;
  expected_fields: string[];
}

/**
 * Idempotency test fixture
 */
export interface IdempotencyFixture {
  description: string;
  contract_id: string;
  action: string;
  params1: object;
  params2?: object;
  same_key: boolean;
}

/**
 * Outcome classification test fixture
 */
export interface OutcomeFixture {
  description: string;
  response: { status: number; body?: unknown };
  expected_outcome: string;
}
