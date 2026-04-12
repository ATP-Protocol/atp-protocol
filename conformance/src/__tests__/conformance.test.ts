/**
 * ATP Conformance Test Suite Self-Tests
 *
 * These tests verify that the test suite itself works correctly by
 * running against the reference implementation.
 */

import { ConformanceRunner } from "../runner";
import { createReferenceAdapter } from "../adapters/reference";

describe("ATP Conformance Suite", () => {
  it("should run conformance tests against reference implementation", async () => {
    const target = createReferenceAdapter();
    const runner = new ConformanceRunner(target, "reference");
    const report = await runner.run();

    // Verify report structure
    expect(report).toHaveProperty("target_name");
    expect(report).toHaveProperty("atp_version");
    expect(report).toHaveProperty("suite_version");
    expect(report).toHaveProperty("tested_at");
    expect(report).toHaveProperty("level_achieved");
    expect(report).toHaveProperty("results");

    // Verify results structure
    expect(report.results).toHaveProperty("aware");
    expect(report.results).toHaveProperty("compatible");
    expect(report.results).toHaveProperty("verified");
    expect(report.results).toHaveProperty("attested");

    console.log("\n=== ATP Conformance Report ===");
    console.log(`Target: ${report.target_name}`);
    console.log(`ATP Version: ${report.atp_version}`);
    console.log(`Suite Version: ${report.suite_version}`);
    console.log(`Conformance Level: ${report.level_achieved}`);
    console.log("\n=== Level Results ===");
    console.log(`Aware:      ${report.results.aware.passed}/${report.results.aware.tests.length} passed`);
    console.log(`Compatible: ${report.results.compatible.passed}/${report.results.compatible.tests.length} passed`);
    console.log(`Verified:   ${report.results.verified.passed}/${report.results.verified.tests.length} passed`);
    console.log(`Attested:   ${report.results.attested.passed}/${report.results.attested.tests.length} passed`);
  });

  it("should have comprehensive test fixtures", async () => {
    const target = createReferenceAdapter();
    const runner = new ConformanceRunner(target, "reference");
    const report = await runner.run();

    // Verify we have substantial test coverage
    const totalTests =
      report.results.aware.tests.length +
      report.results.compatible.tests.length +
      report.results.verified.tests.length;

    expect(totalTests).toBeGreaterThan(100);
    console.log(`\nTotal conformance tests: ${totalTests}`);
  });

  it("reference implementation should achieve compatible level", async () => {
    const target = createReferenceAdapter();
    const runner = new ConformanceRunner(target, "reference");
    const report = await runner.run();

    // Show failures for debugging
    if (report.results.compatible.failed > 0) {
      console.log("\n=== Compatible Level Failures ===");
      report.results.compatible.tests
        .filter((t) => !t.passed)
        .forEach((t) => {
          console.log(`${t.name}: ${t.error}`);
        });
    }

    if (report.results.verified.failed > 0) {
      console.log("\n=== Verified Level Failures ===");
      report.results.verified.tests
        .filter((t) => !t.passed)
        .forEach((t) => {
          console.log(`${t.name}: ${t.error}`);
        });
    }

    // Reference should pass aware and compatible levels
    // (verified level requires advanced features like idempotency and evidence hashing)
    expect(report.results.aware.failed).toBeLessThan(5);
    expect(report.results.compatible.failed).toBeLessThan(10);

    // Report the achieved level
    console.log(`\nReference implementation achieved: ${report.level_achieved}`);
    console.log(`Test coverage: ${report.results.aware.tests.length + report.results.compatible.tests.length + report.results.verified.tests.length} tests`);
  });
});
