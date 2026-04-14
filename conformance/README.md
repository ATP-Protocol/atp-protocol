# ATP Conformance Test Suite

A standalone, portable test harness for verifying ATP (Agent Trust Protocol) spec compliance across gateway implementations.

## Overview

The ATP Conformance Test Suite provides:

- **JSON fixtures** that any implementation can consume directly
- **TypeScript test runner** for automated conformance validation
- **4 conformance levels** aligned with the ATP spec
- **Comprehensive coverage** across contract validation, policy evaluation, approval state machines, evidence capture, and idempotency

## Conformance Levels

The suite validates 4 levels of ATP compliance:

### Level 1: Aware
Contract parsing and validation. Implementations can understand ATP contracts without executing them.

- Contract schema validation
- Required field checking
- Attestation level verification
- Idempotency model validation

### Level 2: Compatible
Full policy evaluation and approval state machines. Production-ready gateways at this level can enforce policies and manage approval workflows.

- Policy evaluation (enumeration, domain, numeric, boolean, deny list)
- Approval state machine transitions
- Fail-closed policy enforcement
- Structured execution records

### Level 3: Verified
Evidence capture, deterministic idempotency, and outcome classification. This level enables full audit trails and idempotency guarantees.

- Evidence record capture with all required fields
- Deterministic idempotency key computation
- Outcome classification (success, failure, timeout, unknown)
- Evidence write failure handling

### Level 4: Attested
External attestation backend integration and evidence anchoring. The highest level enables independently verifiable, externally anchored evidence.

- Evidence anchoring to external attestation backend
- Cross-organization verification
- External attestation objects

## Installation

```bash
npm install @atp-protocol/conformance
```

## Quick Start

### Using the Test Runner (TypeScript)

```typescript
import { runConformanceTests } from "@atp-protocol/conformance";
import { MyGatewayImplementation } from "./my-gateway";

const impl = new MyGatewayImplementation();
const report = await runConformanceTests(impl, "my-gateway");

console.log(`Achieved level: ${report.level_achieved}`);
console.log(`Tests passed: ${report.results.aware.passed}`);
console.log(`Tests failed: ${report.results.aware.failed}`);
```

### Using Raw Fixtures (Any Language)

The fixtures are published as JSON and can be consumed by any implementation:

```json
// contracts.json
[
  {
    "name": "valid_minimal_contract",
    "contract": {
      "version": "1.0.0",
      "authority": "urn:atp:auth:example-corp",
      "actions": [{"name": "deploy"}],
      "attestation": {"level": "aware"}
    },
    "expected_valid": true
  }
]
```

Load and test against your implementation:

```python
import json

with open("contracts.json") as f:
    fixtures = json.load(f)["fixtures"]

for fixture in fixtures:
    result = my_implementation.validate_contract(fixture["contract"])
    assert result["valid"] == fixture["expected_valid"]
```

## Fixture Structure

### contracts.json
Contains 12 test fixtures for contract validation:
- Valid minimal and full contracts
- Missing required fields (version, authority, actions, attestation)
- Invalid formats (version, authority)
- Empty actions array
- Invalid attestation levels
- Unsafe idempotency without ack flag

### policy.json
Contains 12 test fixtures for policy evaluation:
- Enumeration policies (permit/deny)
- Domain matching (permit/deny)
- Numeric max constraints (permit/deny)
- Boolean constraints (true/false)
- Deny lists (permit/deny)
- No scope (always permit)
- Unknown actions (deny)

### approval.json
Contains 11 test fixtures for approval state machines:
- Happy path: REQUESTED → PENDING_REVIEW → APPROVED
- Denial path: REQUESTED → PENDING_REVIEW → DENIED
- Timeout with escalation: PENDING_REVIEW → ESCALATED
- Revocation from each non-terminal state
- Invalid transitions

### evidence.json
Contains 4 test fixtures for evidence records:
- All 18 required fields
- Minimal required fields
- Evidence with approval context
- Evidence documenting failures

### idempotency.json
Contains 8 test fixtures for idempotency key computation:
- Deterministic key generation (same input = same key)
- Different keys for different params
- Complex nested params
- Parameter order independence (JSON canonical form)

### outcome.json
Contains 13 test fixtures for outcome classification:
- HTTP 2xx → success
- HTTP 4xx → failure
- HTTP 5xx → failure
- HTTP 202 → unknown
- Timeout → timeout
- No response body handling

## ConformanceTarget Interface

Implement this interface to test your gateway:

```typescript
interface ConformanceTarget {
  // Level 1: Aware
  validateContract(contract: unknown): {
    valid: boolean;
    errors: Array<{ field: string; code: string }>;
  };

  // Level 2: Compatible
  evaluatePolicy(
    contract: object,
    params: Record<string, unknown>
  ): {
    permitted: boolean;
    denial_reason?: string;
  };

  transitionApproval(
    state: string,
    trigger: string
  ): { next_state: string } | { error: string };

  // Level 3: Verified (optional)
  captureEvidence?(input: object): {
    evidence_id: string;
    execution_id: string;
    request_hash: string;
  };

  computeIdempotencyKey?(
    contractId: string,
    action: string,
    params: object
  ): string;

  classifyOutcome?(response: {
    status: number;
    body?: unknown;
  }): string;

  // Level 4: Attested (optional)
  anchorEvidence?(evidenceId: string): Promise<{
    tx_hash: string;
    block: number;
  }>;
}
```

## ConformanceReport Output

The test runner produces a detailed report:

```typescript
interface ConformanceReport {
  target_name: string;
  atp_version: string;
  suite_version: string;
  tested_at: string;
  level_achieved: "none" | "aware" | "compatible" | "verified" | "attested";
  results: {
    aware: {
      passed: number;
      failed: number;
      tests: Array<{
        name: string;
        passed: boolean;
        error?: string;
        duration_ms: number;
      }>;
    };
    // ... compatible, verified, attested follow same structure
  };
}
```

## Example Implementation

A reference implementation is provided in `src/__tests__/conformance.test.ts`:

```typescript
import { ConformanceTarget } from "@atp-protocol/conformance";

class MyGateway implements ConformanceTarget {
  validateContract(contract: unknown) {
    // ... validation logic
  }

  evaluatePolicy(contract: object, params: Record<string, unknown>) {
    // ... policy evaluation
  }

  transitionApproval(state: string, trigger: string) {
    // ... state machine
  }

  // ... implement other methods
}

const impl = new MyGateway();
const report = await runConformanceTests(impl, "my-gateway");
```

## Running Tests

```bash
# Build the suite
npm run build

# Run conformance tests
npm test

# Run with coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

## Test Coverage

The suite contains:
- **12** contract validation tests
- **12** policy evaluation tests
- **11** approval state machine tests
- **4** evidence capture tests
- **8** idempotency tests
- **13** outcome classification tests
- **Total: 60+ test fixtures**

Plus additional tests for:
- Invalid state transitions
- Error handling
- Missing required methods

## Compliance Declaration

After running the test suite successfully, declare your conformance level in gateway metadata:

```json
{
  "gateway_id": "gw_prod_01",
  "atp_version": "1.0.0",
  "conformance_level": "verified",
  "conformance_suite_version": "0.1.0",
  "conformance_verified_at": "2026-04-12"
}
```

## Level Achievement Rules

- **Aware**: All contract validation tests pass
- **Compatible**: All aware + policy + approval tests pass
- **Verified**: All compatible + evidence + idempotency + outcome tests pass
- **Attested**: All verified + evidence anchoring tests pass

## FAQ

**Q: Can I use the fixtures without the test runner?**
Yes. The fixtures are standalone JSON files that any language can consume.

**Q: Do I need to implement all 4 levels?**
No. Implementations can achieve any level. Level 1 (Aware) is the minimum for ATP compliance.

**Q: How often are the fixtures updated?**
The fixtures are versioned along with the ATP spec. Check `suite_version` in the report to track updates.

**Q: Can I extend the test suite?**
Yes, but the standard fixtures should be used for interoperability. You can add implementation-specific tests separately.

**Q: What if a method is optional and I don't implement it?**
The test runner will skip Level 3+ tests. Your gateway will be reported as Level 1 or 2.

## Contributing

To report issues or suggest fixture additions, please reference the ATP spec section and include test cases.

## License

MIT
