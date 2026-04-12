#!/usr/bin/env node

/**
 * ATP Conformance CLI
 * Run conformance tests against a ConformanceTarget implementation
 *
 * Usage:
 *   npx @atp-protocol/conformance --target ./my-adapter.js
 */

import * as fs from "fs";
import * as path from "path";
import { ConformanceRunner } from "./runner";
import { ConformanceTarget } from "./types";

async function main() {
  const args = process.argv.slice(2);

  // Parse arguments
  let targetPath: string | null = null;
  let outputFormat: "json" | "text" = "text";
  let quiet = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--target" && i + 1 < args.length) {
      targetPath = args[++i];
    } else if (arg === "--format" && i + 1 < args.length) {
      outputFormat = args[++i] as "json" | "text";
    } else if (arg === "--quiet" || arg === "-q") {
      quiet = true;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  // Validate arguments
  if (!targetPath) {
    console.error("Error: --target is required");
    console.error("Usage: atp-conformance --target ./my-adapter.js");
    process.exit(1);
  }

  // Resolve target path
  const absoluteTargetPath = path.resolve(targetPath);

  // Load the target
  let target: ConformanceTarget;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const module = require(absoluteTargetPath);
    target = module.default || module;

    if (!target || typeof target !== "object") {
      throw new Error("Target must export a ConformanceTarget object");
    }

    // Verify it has required methods
    if (typeof target.validateContract !== "function") {
      throw new Error("Target must implement validateContract method");
    }
  } catch (error) {
    console.error(`Error loading target from ${absoluteTargetPath}:`);
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  // Determine target name
  const targetName = path.basename(absoluteTargetPath, path.extname(absoluteTargetPath));

  // Run tests
  if (!quiet) {
    console.log(`\nATP Conformance Test Suite`);
    console.log(`Target: ${targetName}`);
    console.log(`Location: ${absoluteTargetPath}`);
    console.log(`\nRunning tests...\n`);
  }

  const runner = new ConformanceRunner(target, targetName);
  const report = await runner.run();

  // Output results
  if (outputFormat === "json") {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printTextReport(report);
  }

  // Exit with appropriate code
  const hasFailures =
    report.results.aware.failed > 0 ||
    report.results.compatible.failed > 0 ||
    report.results.verified.failed > 0;

  process.exit(hasFailures ? 1 : 0);
}

function printHelp() {
  console.log(`
ATP Conformance Test Suite

Usage:
  atp-conformance --target <path> [options]

Options:
  --target <path>     Path to ConformanceTarget implementation (required)
  --format <format>   Output format: json or text (default: text)
  --quiet, -q         Suppress non-result output
  --help, -h          Show this help message

Examples:
  atp-conformance --target ./my-adapter.js
  atp-conformance --target ./my-adapter.js --format json
  npx @atp-protocol/conformance --target ./my-adapter.js

The target must export a ConformanceTarget object with the following methods:
  - validateContract(contract: unknown): ValidationResult
  - evaluatePolicy(contract: object, params: Record<string, unknown>): EvaluationResult
  - transitionApproval(state: string, trigger: string): { next_state: string } | { error: string }

Optional methods for higher conformance levels:
  - captureEvidence(input: object): EvidenceResult
  - computeIdempotencyKey(contractId: string, action: string, params: object): string
  - classifyOutcome(response: { status: number; body?: unknown }): string
  - anchorEvidence(evidenceId: string): Promise<AnchorResult>
`);
}

function printTextReport(report: any) {
  const padRight = (str: string, len: number) => str.padEnd(len);
  const padLeft = (str: string, len: number) => str.padStart(len);

  console.log(
    `
═══════════════════════════════════════════════════════════════════════════════
  ATP Conformance Report
═══════════════════════════════════════════════════════════════════════════════

Target:           ${report.target_name}
ATP Version:      ${report.atp_version}
Suite Version:    ${report.suite_version}
Tested At:        ${report.tested_at}
Conformance Level: ${report.level_achieved.toUpperCase()}

───────────────────────────────────────────────────────────────────────────────
  Level Results
───────────────────────────────────────────────────────────────────────────────
`
  );

  const levels = ["aware", "compatible", "verified", "attested"];

  for (const level of levels) {
    const result = report.results[level];
    const total = result.passed + result.failed;
    const percentage = total > 0 ? ((result.passed / total) * 100).toFixed(1) : "N/A";

    const status = result.failed === 0 && result.tests.length > 0 ? "✓ PASS" : result.tests.length === 0 ? "  SKIP" : "✗ FAIL";

    console.log(
      `${status}  ${padRight(level.toUpperCase(), 15)}  ${padLeft(String(result.passed), 3)}/${padLeft(
        String(total),
        3
      )} passed  (${percentage}%)`
    );

    // Print failed tests
    if (result.failed > 0) {
      for (const test of result.tests) {
        if (!test.passed && test.error) {
          console.log(`        ✗ ${test.name}`);
          console.log(`          ${test.error.replace(/\n/g, "\n          ")}`);
        }
      }
    }
  }

  // Summary
  const totalTests =
    report.results.aware.tests.length +
    report.results.compatible.tests.length +
    report.results.verified.tests.length +
    report.results.attested.tests.length;
  const totalPassed =
    report.results.aware.passed +
    report.results.compatible.passed +
    report.results.verified.passed +
    report.results.attested.passed;
  const totalFailed =
    report.results.aware.failed +
    report.results.compatible.failed +
    report.results.verified.failed +
    report.results.attested.failed;

  console.log(`
───────────────────────────────────────────────────────────────────────────────
  Summary
───────────────────────────────────────────────────────────────────────────────

Total Tests:      ${totalTests}
Passed:           ${totalPassed}
Failed:           ${totalFailed}
Success Rate:     ${((totalPassed / totalTests) * 100).toFixed(1)}%

═══════════════════════════════════════════════════════════════════════════════
`);

  // Detailed failure report if there are failures
  if (totalFailed > 0) {
    console.log("\n❌ Conformance test failures detected.\n");
  } else if (totalTests > 0) {
    console.log("\n✅ All conformance tests passed!\n");
  }
}

main().catch((error) => {
  console.error("Fatal error:", error instanceof Error ? error.message : String(error));
  process.exit(2);
});
