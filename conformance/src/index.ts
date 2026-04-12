/**
 * ATP Conformance Test Suite
 * Public API for running conformance tests against ATP implementations
 */

export {
  ConformanceTarget,
  ConformanceReport,
  LevelResults,
  TestResult,
  ValidationResult,
  EvaluationResult,
  EvidenceResult,
  AnchorResult,
  ContractFixture,
  PolicyFixture,
  ApprovalFixture,
  EvidenceFixture,
  IdempotencyFixture,
  OutcomeFixture,
} from "./types";

export { ConformanceRunner, runConformanceTests } from "./runner";

// Export adapters
export { ReferenceAtpAdapter, createReferenceAdapter } from "./adapters/reference";

// Export fixtures
export { default as contractFixtures } from "./fixtures/contracts.json";
export { default as policyFixtures } from "./fixtures/policy.json";
export { default as approvalFixtures } from "./fixtures/approval.json";
export { default as evidenceFixtures } from "./fixtures/evidence.json";
export { default as idempotencyFixtures } from "./fixtures/idempotency.json";
export { default as outcomeFixtures } from "./fixtures/outcome.json";
