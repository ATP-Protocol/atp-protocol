/**
 * ATP Conformance Test Runner
 * Executes test fixtures against a ConformanceTarget implementation
 */

import {
  ConformanceTarget,
  ConformanceReport,
  LevelResults,
  TestResult,
  ContractFixture,
  PolicyFixture,
  ApprovalFixture,
  EvidenceFixture,
  IdempotencyFixture,
  OutcomeFixture,
} from "./types";

import contractFixtures from "./fixtures/contracts.json";
import policyFixtures from "./fixtures/policy.json";
import approvalFixtures from "./fixtures/approval.json";
import evidenceFixtures from "./fixtures/evidence.json";
import idempotencyFixtures from "./fixtures/idempotency.json";
import outcomeFixtures from "./fixtures/outcome.json";

export class ConformanceRunner {
  private target: ConformanceTarget;
  private targetName: string;
  private atpVersion: string = "1.0.0";
  private suiteVersion: string = "1.0.0";

  constructor(target: ConformanceTarget, targetName: string) {
    this.target = target;
    this.targetName = targetName;
  }

  /**
   * Run the full conformance test suite
   */
  async run(): Promise<ConformanceReport> {
    const testedAt = new Date().toISOString();

    const awareResults = await this.runAwareLevelTests();
    const compatibleResults = await this.runCompatibleLevelTests();
    const verifiedResults = await this.runVerifiedLevelTests();
    const attestedResults = await this.runAttestedLevelTests();

    const levelAchieved = this.determineLevel(
      awareResults,
      compatibleResults,
      verifiedResults,
      attestedResults
    );

    return {
      target_name: this.targetName,
      atp_version: this.atpVersion,
      suite_version: this.suiteVersion,
      tested_at: testedAt,
      level_achieved: levelAchieved,
      results: {
        aware: awareResults,
        compatible: compatibleResults,
        verified: verifiedResults,
        attested: attestedResults,
      },
    };
  }

  /**
   * Run ATP-Aware conformance tests
   * Level 1: Contract validation only
   */
  private async runAwareLevelTests(): Promise<LevelResults> {
    const tests: TestResult[] = [];

    for (const fixture of (contractFixtures as any).fixtures) {
      const startTime = Date.now();
      let passed = false;
      let error: string | undefined;

      try {
        const result = this.target.validateContract(fixture.contract);

        // Check valid/invalid match
        if (result.valid !== fixture.expected_valid) {
          error = `Expected valid=${fixture.expected_valid}, got ${result.valid}`;
        }

        // Check error counts if invalid
        if (!result.valid && fixture.expected_errors) {
          if (result.errors.length !== fixture.expected_errors.length) {
            error = `Expected ${fixture.expected_errors.length} errors, got ${result.errors.length}`;
          } else {
            // Check each error code matches
            for (let i = 0; i < fixture.expected_errors.length; i++) {
              const expected = fixture.expected_errors[i];
              const actual = result.errors[i];
              if (
                actual.field !== expected.field ||
                actual.code !== expected.code
              ) {
                error = `Error ${i}: expected {field: ${expected.field}, code: ${expected.code}}, got {field: ${actual.field}, code: ${actual.code}}`;
                break;
              }
            }
          }
        }

        passed = !error;
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      }

      tests.push({
        name: fixture.name,
        passed,
        error,
        duration_ms: Date.now() - startTime,
      });
    }

    return {
      passed: tests.filter((t) => t.passed).length,
      failed: tests.filter((t) => !t.passed).length,
      tests,
    };
  }

  /**
   * Run ATP-Compatible conformance tests
   * Level 2: Policy evaluation and approval state machine
   */
  private async runCompatibleLevelTests(): Promise<LevelResults> {
    const tests: TestResult[] = [];

    // Policy evaluation tests
    for (const fixture of (policyFixtures as any).fixtures) {
      const startTime = Date.now();
      let passed = false;
      let error: string | undefined;

      try {
        const result = this.target.evaluatePolicy(fixture.contract, fixture.params);

        if (result.permitted !== fixture.expected_permitted) {
          error = `Expected permitted=${fixture.expected_permitted}, got ${result.permitted}`;
        }

        if (
          !result.permitted &&
          fixture.expected_denial_reason &&
          result.denial_reason !== fixture.expected_denial_reason
        ) {
          error = `Expected denial_reason=${fixture.expected_denial_reason}, got ${result.denial_reason}`;
        }

        passed = !error;
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      }

      tests.push({
        name: `policy_${fixture.name}`,
        passed,
        error,
        duration_ms: Date.now() - startTime,
      });
    }

    // Approval state machine tests
    for (const fixture of (approvalFixtures as any).fixtures) {
      const startTime = Date.now();
      let passed = true;
      let error: string | undefined;

      try {
        let currentState = "INITIAL";

        for (const transition of fixture.transitions) {
          const result = this.target.transitionApproval(
            transition.state,
            transition.trigger
          );

          if ("error" in result) {
            if (transition.expected_error) {
              if (result.error !== transition.expected_error) {
                error = `Expected error=${transition.expected_error}, got ${result.error}`;
                passed = false;
                break;
              }
            } else {
              error = `Unexpected error: ${result.error}`;
              passed = false;
              break;
            }
          } else if ("next_state" in result) {
            if (!transition.expected_next_state) {
              error = `Expected error but got next_state=${result.next_state}`;
              passed = false;
              break;
            }
            if (result.next_state !== transition.expected_next_state) {
              error = `Expected next_state=${transition.expected_next_state}, got ${result.next_state}`;
              passed = false;
              break;
            }
            currentState = result.next_state;
          }
        }
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
        passed = false;
      }

      tests.push({
        name: `approval_${fixture.name}`,
        passed,
        error,
        duration_ms: Date.now() - startTime,
      });
    }

    return {
      passed: tests.filter((t) => t.passed).length,
      failed: tests.filter((t) => !t.passed).length,
      tests,
    };
  }

  /**
   * Run ATP-Verified conformance tests
   * Level 3: Evidence capture, idempotency, outcome classification
   */
  private async runVerifiedLevelTests(): Promise<LevelResults> {
    const tests: TestResult[] = [];

    // Evidence capture tests
    for (const fixture of (evidenceFixtures as any).fixtures) {
      const startTime = Date.now();
      let passed = false;
      let error: string | undefined;

      try {
        if (!this.target.captureEvidence) {
          error = "captureEvidence not implemented";
        } else {
          const result = this.target.captureEvidence(fixture.input);

          // Check all expected fields are present in either input or result
          for (const field of fixture.expected_fields) {
            // Fields can be in the input (passed through) or result (generated)
            if (!(field in result)) {
              error = `Missing required field: ${field}`;
              break;
            }
          }

          // Check evidence_id and execution_id are non-empty strings
          if (
            !error &&
            (!result.evidence_id || typeof result.evidence_id !== "string")
          ) {
            error = "evidence_id must be a non-empty string";
          }
          if (
            !error &&
            (!result.execution_id || typeof result.execution_id !== "string")
          ) {
            error = "execution_id must be a non-empty string";
          }

          passed = !error;
        }
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      }

      tests.push({
        name: `evidence_${fixture.name}`,
        passed,
        error,
        duration_ms: Date.now() - startTime,
      });
    }

    // Idempotency key tests
    for (const fixture of (idempotencyFixtures as any).fixtures) {
      const startTime = Date.now();
      let passed = false;
      let error: string | undefined;

      try {
        if (!this.target.computeIdempotencyKey) {
          error = "computeIdempotencyKey not implemented";
        } else {
          const key1 = this.target.computeIdempotencyKey(
            fixture.contract_id,
            fixture.action,
            fixture.params1
          );

          if (fixture.same_key && fixture.params2) {
            const key2 = this.target.computeIdempotencyKey(
              fixture.contract_id,
              fixture.action,
              fixture.params2
            );

            if (key1 !== key2) {
              error = `Expected same keys, got ${key1} vs ${key2}`;
            } else {
              passed = true;
            }
          } else if (!fixture.same_key && fixture.params2) {
            const key2 = this.target.computeIdempotencyKey(
              fixture.contract_id,
              "different_action",
              fixture.params2
            );

            if (key1 === key2) {
              error = `Expected different keys, got ${key1}`;
            } else {
              passed = true;
            }
          } else {
            // Just verify key is a non-empty string
            if (key1 && typeof key1 === "string") {
              passed = true;
            } else {
              error = "computeIdempotencyKey must return a non-empty string";
            }
          }
        }
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      }

      tests.push({
        name: `idempotency_${fixture.name}`,
        passed,
        error,
        duration_ms: Date.now() - startTime,
      });
    }

    // Outcome classification tests
    for (const fixture of (outcomeFixtures as any).fixtures) {
      const startTime = Date.now();
      let passed = false;
      let error: string | undefined;

      try {
        if (!this.target.classifyOutcome) {
          error = "classifyOutcome not implemented";
        } else {
          const result = this.target.classifyOutcome(fixture.response);

          if (result !== fixture.expected_outcome) {
            error = `Expected outcome=${fixture.expected_outcome}, got ${result}`;
          } else {
            passed = true;
          }
        }
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      }

      tests.push({
        name: `outcome_${fixture.name}`,
        passed,
        error,
        duration_ms: Date.now() - startTime,
      });
    }

    return {
      passed: tests.filter((t) => t.passed).length,
      failed: tests.filter((t) => !t.passed).length,
      tests,
    };
  }

  /**
   * Run ATP-Attested conformance tests
   * Level 4: DUAL network integration and evidence anchoring
   */
  private async runAttestedLevelTests(): Promise<LevelResults> {
    const tests: TestResult[] = [];

    // For now, just verify that anchorEvidence is implemented
    const startTime = Date.now();
    let passed = false;
    let error: string | undefined;

    try {
      if (!this.target.anchorEvidence) {
        error = "anchorEvidence not implemented";
      } else {
        // Just verify the method signature is correct
        passed = true;
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }

    tests.push({
      name: "attested_interface_exists",
      passed,
      error,
      duration_ms: Date.now() - startTime,
    });

    return {
      passed: tests.filter((t) => t.passed).length,
      failed: tests.filter((t) => !t.passed).length,
      tests,
    };
  }

  /**
   * Determine highest conformance level achieved
   */
  private determineLevel(
    aware: LevelResults,
    compatible: LevelResults,
    verified: LevelResults,
    attested: LevelResults
  ): "none" | "aware" | "compatible" | "verified" | "attested" {
    if (attested.failed === 0 && attested.tests.length > 0) {
      return "attested";
    }
    if (verified.failed === 0 && verified.tests.length > 0) {
      return "verified";
    }
    if (compatible.failed === 0 && compatible.tests.length > 0) {
      return "compatible";
    }
    if (aware.failed === 0 && aware.tests.length > 0) {
      return "aware";
    }
    return "none";
  }

  /**
   * Can we run compatible level tests?
   * Requires all aware tests to pass
   */
  private canRunCompatible(aware: LevelResults): boolean {
    return aware.failed === 0;
  }

  /**
   * Can we run verified level tests?
   * Requires all compatible tests to pass
   */
  private canRunVerified(compatible: LevelResults): boolean {
    return compatible.failed === 0 && compatible.tests.length > 0;
  }

  /**
   * Can we run attested level tests?
   * Requires all verified tests to pass
   */
  private canRunAttested(verified: LevelResults): boolean {
    return verified.failed === 0 && verified.tests.length > 0;
  }
}

/**
 * Run conformance tests against an implementation
 */
export async function runConformanceTests(
  target: ConformanceTarget,
  targetName: string
): Promise<ConformanceReport> {
  const runner = new ConformanceRunner(target, targetName);
  return runner.run();
}
