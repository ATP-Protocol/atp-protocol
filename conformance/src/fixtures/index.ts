/**
 * ATP Conformance Fixtures
 * Exported fixtures for use in any language implementation
 */

export { default as contractFixtures } from "./contracts.json";
export { default as policyFixtures } from "./policy.json";
export { default as approvalFixtures } from "./approval.json";
export { default as evidenceFixtures } from "./evidence.json";
export { default as idempotencyFixtures } from "./idempotency.json";
export { default as outcomeFixtures } from "./outcome.json";

export type {
  ContractFixture,
  PolicyFixture,
  ApprovalFixture,
  EvidenceFixture,
  IdempotencyFixture,
  OutcomeFixture,
} from "../types";
