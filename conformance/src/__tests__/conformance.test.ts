/**
 * ATP Conformance Test Suite Self-Tests
 *
 * These tests verify that the test suite itself works correctly by
 * running against a reference implementation.
 */

import { ConformanceRunner, runConformanceTests } from "../runner";
import {
  ConformanceTarget,
  ValidationResult,
  EvaluationResult,
} from "../types";
import crypto from "crypto";

/**
 * Reference implementation that passes all conformance levels
 */
class ReferenceImplementation implements ConformanceTarget {
  // ===== LEVEL 1: AWARE =====

  validateContract(contract: unknown): ValidationResult {
    if (typeof contract !== "object" || contract === null) {
      return {
        valid: false,
        errors: [{ field: "root", code: "not_an_object" }],
      };
    }

    const c = contract as Record<string, unknown>;
    const errors: Array<{ field: string; code: string }> = [];

    // Check required fields
    if (!c.version || typeof c.version !== "string") {
      errors.push({ field: "version", code: "required" });
    } else {
      // Validate semver format (basic check)
      if (!/^\d+\.\d+\.\d+/.test(c.version)) {
        errors.push({ field: "version", code: "invalid_format" });
      }
    }

    if (!c.authority || typeof c.authority !== "string") {
      errors.push({ field: "authority", code: "required" });
    } else {
      // Validate URN format
      if (!c.authority.startsWith("urn:")) {
        errors.push({ field: "authority", code: "invalid_format" });
      }
    }

    if (!Array.isArray(c.actions)) {
      errors.push({ field: "actions", code: "required" });
    } else if (c.actions.length === 0) {
      errors.push({ field: "actions", code: "min_items" });
    }

    if (!c.attestation) {
      errors.push({ field: "attestation", code: "required" });
    } else if (typeof c.attestation === "object" && c.attestation !== null) {
      const att = c.attestation as Record<string, unknown>;
      const validLevels = ["aware", "compatible", "verified", "attested"];
      if (att.level && !validLevels.includes(String(att.level))) {
        errors.push({ field: "attestation.level", code: "invalid_enum" });
      }

      // Check unsafe idempotency requires ack
      if (
        att.idempotency_model === "unsafe" &&
        !att.require_ack
      ) {
        errors.push({
          field: "attestation.require_ack",
          code: "required_with_unsafe",
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  // ===== LEVEL 2: COMPATIBLE =====

  evaluatePolicy(
    contract: object,
    params: Record<string, unknown>
  ): EvaluationResult {
    const c = contract as any;

    // Find the action being executed
    const action = c.actions?.find(
      (a: any) => a.name === params.action
    );

    if (!action) {
      return {
        permitted: false,
        denial_reason: "action_not_defined",
      };
    }

    // If no policy, permit
    if (!action.policy) {
      return {
        permitted: true,
      };
    }

    const policy = action.policy;

    // Evaluate based on policy type
    switch (policy.type) {
      case "enumeration":
        if (
          Array.isArray(policy.values) &&
          policy.values.includes(params.target)
        ) {
          return { permitted: true };
        }
        return {
          permitted: false,
          denial_reason: "not_in_enumeration",
        };

      case "domain":
        if (this.matchesDomain(String(params.host), policy.pattern)) {
          return { permitted: true };
        }
        return {
          permitted: false,
          denial_reason: "domain_not_allowed",
        };

      case "numeric":
        if (
          typeof params.amount === "number" &&
          params.amount <= policy.max
        ) {
          return { permitted: true };
        }
        return {
          permitted: false,
          denial_reason: "exceeds_maximum",
        };

      case "boolean":
        if (params.enabled === true) {
          return { permitted: true };
        }
        return {
          permitted: false,
          denial_reason: "constraint_not_met",
        };

      case "deny_list":
        if (
          Array.isArray(policy.denied) &&
          policy.denied.some((denied: string) =>
            String(params.command).includes(denied)
          )
        ) {
          return {
            permitted: false,
            denial_reason: "in_deny_list",
          };
        }
        return { permitted: true };

      default:
        return { permitted: true };
    }
  }

  private matchesDomain(host: string, pattern: string): boolean {
    // Simple wildcard matching
    const regex = pattern
      .replace(/\./g, "\\.")
      .replace(/\*/g, "[^.]+")
      .replace(/\.\[/, ".*\\.");
    return new RegExp(`^${regex}$`).test(host);
  }

  transitionApproval(
    state: string,
    trigger: string
  ): { next_state: string } | { error: string } {
    const transitions: Record<string, Record<string, string>> = {
      REQUESTED: {
        request: "PENDING_REVIEW",
      },
      PENDING_REVIEW: {
        approve: "APPROVED",
        deny: "DENIED",
        timeout: "ESCALATED",
        revoke: "REVOKED",
      },
      APPROVED: {
        revoke: "REVOKED",
      },
      ESCALATED: {
        revoke: "REVOKED",
      },
      DENIED: {},
      REVOKED: {},
    };

    if (!transitions[state]) {
      return { error: "unknown_state" };
    }

    const next = transitions[state][trigger];
    if (next) {
      return { next_state: next };
    }

    // Terminal states cannot transition
    if (state === "DENIED" || state === "REVOKED") {
      return { error: "invalid_transition" };
    }

    // Any other invalid transition
    return { error: "invalid_transition" };
  }

  // ===== LEVEL 3: VERIFIED =====

  captureEvidence(input: object): any {
    const i = input as Record<string, unknown>;
    return {
      evidence_id: `ev_${this.generateId()}`,
      execution_id: `ex_${this.generateId()}`,
      contract_id: i.contract_id,
      contract_version: i.contract_version || "1.0.0",
      action_name: i.action_name,
      principal_id: i.principal_id,
      principal_type: i.principal_type || "user",
      agent_id: i.agent_id,
      agent_type: i.agent_type || "gateway",
      request_timestamp: i.request_timestamp,
      request_hash: i.request_hash || `sha256:${this.generateId()}`,
      params: i.params || {},
      approval_state: i.approval_state,
      approval_id: i.approval_id,
      response_status: i.response_status,
      outcome: i.outcome || "unknown",
      execution_duration_ms: i.execution_duration_ms || 0,
      organizational_unit: i.organizational_unit,
    };
  }

  computeIdempotencyKey(
    contractId: string,
    action: string,
    params: object
  ): string {
    // Use sorted JSON to ensure canonical form (parameter order independent)
    const canonical = JSON.stringify({
      contractId,
      action,
      params: this.sortObjectKeys(params),
    });
    return crypto.createHmac("sha256", "atp-idem-secret").update(canonical).digest("hex");
  }

  private sortObjectKeys(obj: any): any {
    if (Array.isArray(obj)) {
      return obj.map((item) => this.sortObjectKeys(item));
    }
    if (obj !== null && typeof obj === "object") {
      const sorted: any = {};
      Object.keys(obj)
        .sort()
        .forEach((key) => {
          sorted[key] = this.sortObjectKeys(obj[key]);
        });
      return sorted;
    }
    return obj;
  }

  classifyOutcome(response: { status: number; body?: unknown }): string {
    if (response.status === 0) {
      return "timeout";
    }
    if (response.status === 202) {
      return "unknown";
    }
    if (response.status >= 200 && response.status < 300) {
      return "success";
    }
    if (response.status >= 400) {
      return "failure";
    }
    return "unknown";
  }

  // ===== LEVEL 4: ATTESTED =====

  async anchorEvidence(evidenceId: string): Promise<any> {
    return {
      tx_hash: `0x${this.generateId()}`,
      block: Math.floor(Math.random() * 1000000),
    };
  }

  private generateId(): string {
    return crypto.randomBytes(8).toString("hex");
  }
}

/**
 * Test that the reference implementation achieves at least "compatible" level
 */
describe("ATP Conformance Test Suite", () => {
  it("should run conformance tests against reference implementation", async () => {
    const impl = new ReferenceImplementation();
    const report = await runConformanceTests(
      impl,
      "reference-implementation"
    );

    console.log("\nConformance Report:");
    console.log(JSON.stringify(report, null, 2));

    // Verify structure
    expect(report.target_name).toBe("reference-implementation");
    expect(report.atp_version).toBe("1.0.0");
    expect(report.suite_version).toBe("0.1.0");
    expect(report.tested_at).toBeDefined();
    expect(report.level_achieved).toBeDefined();

    // Verify results structure
    expect(report.results.aware).toBeDefined();
    expect(report.results.compatible).toBeDefined();
    expect(report.results.verified).toBeDefined();
    expect(report.results.attested).toBeDefined();
  });

  it("should achieve 'verified' level for reference implementation", async () => {
    const impl = new ReferenceImplementation();
    const report = await runConformanceTests(
      impl,
      "reference-implementation"
    );

    // Reference implementation should pass verified level at minimum
    expect(["verified", "attested"]).toContain(report.level_achieved);
    expect(report.results.aware.failed).toBe(0);
    expect(report.results.compatible.failed).toBe(0);
    expect(report.results.verified.failed).toBe(0);
  });

  it("should report level 1 (aware) as minimum", async () => {
    const impl = new ReferenceImplementation();
    const report = await runConformanceTests(
      impl,
      "reference-implementation"
    );

    expect(report.results.aware.passed).toBeGreaterThan(0);
    expect(report.results.aware.failed).toBe(0);
  });

  it("should handle contract validation fixtures", async () => {
    const impl = new ReferenceImplementation();
    const report = await runConformanceTests(
      impl,
      "reference-implementation"
    );

    const contractTests = report.results.aware.tests;
    expect(contractTests.length).toBeGreaterThan(0);

    // Check that we have both valid and invalid contract tests
    const hasValid = contractTests.some((t) =>
      t.name.includes("valid")
    );
    const hasInvalid = contractTests.some((t) =>
      t.name.includes("missing") || t.name.includes("invalid")
    );

    expect(hasValid).toBe(true);
    expect(hasInvalid).toBe(true);
  });

  it("should handle policy evaluation fixtures", async () => {
    const impl = new ReferenceImplementation();
    const report = await runConformanceTests(
      impl,
      "reference-implementation"
    );

    const policyTests = report.results.compatible.tests.filter((t) =>
      t.name.startsWith("policy_")
    );
    expect(policyTests.length).toBeGreaterThan(0);

    // Check for various policy types
    const hasEnumeration = policyTests.some((t) =>
      t.name.includes("enumeration")
    );
    const hasDomain = policyTests.some((t) => t.name.includes("domain"));
    const hasNumeric = policyTests.some((t) => t.name.includes("numeric"));

    expect(hasEnumeration).toBe(true);
    expect(hasDomain).toBe(true);
    expect(hasNumeric).toBe(true);
  });

  it("should handle approval state machine fixtures", async () => {
    const impl = new ReferenceImplementation();
    const report = await runConformanceTests(
      impl,
      "reference-implementation"
    );

    const approvalTests = report.results.compatible.tests.filter((t) =>
      t.name.startsWith("approval_")
    );
    expect(approvalTests.length).toBeGreaterThan(0);

    // Check for happy path and denial paths
    const hasHappyPath = approvalTests.some((t) =>
      t.name.includes("happy_path")
    );
    const hasDenial = approvalTests.some((t) =>
      t.name.includes("denial")
    );

    expect(hasHappyPath).toBe(true);
    expect(hasDenial).toBe(true);
  });

  it("should handle evidence and idempotency fixtures", async () => {
    const impl = new ReferenceImplementation();
    const report = await runConformanceTests(
      impl,
      "reference-implementation"
    );

    const evidenceTests = report.results.verified.tests.filter((t) =>
      t.name.startsWith("evidence_")
    );
    const idempotencyTests = report.results.verified.tests.filter((t) =>
      t.name.startsWith("idempotency_")
    );

    expect(evidenceTests.length).toBeGreaterThan(0);
    expect(idempotencyTests.length).toBeGreaterThan(0);
  });

  it("should handle outcome classification fixtures", async () => {
    const impl = new ReferenceImplementation();
    const report = await runConformanceTests(
      impl,
      "reference-implementation"
    );

    const outcomeTests = report.results.verified.tests.filter((t) =>
      t.name.startsWith("outcome_")
    );
    expect(outcomeTests.length).toBeGreaterThan(0);

    // Check for various status codes
    const has200 = outcomeTests.some((t) =>
      t.name.includes("200_success")
    );
    const has4xx = outcomeTests.some((t) =>
      t.name.includes("400") || t.name.includes("401")
    );
    const has5xx = outcomeTests.some((t) =>
      t.name.includes("500") || t.name.includes("503")
    );

    expect(has200).toBe(true);
    expect(has4xx).toBe(true);
    expect(has5xx).toBe(true);
  });
});
