---
sidebar_position: 1
---

# Conformance Testing

ATP includes a comprehensive conformance test suite to verify that implementations are correct and secure. This page explains the 4 conformance levels and how to certify your implementation.

## 4 Conformance Levels

ATP defines 4 conformance levels with increasing rigor:

### Level 1: Basic

Verify core protocol mechanics work correctly.

**Test Areas:**
- Contract loading and validation
- Action proposal and status tracking
- Policy constraint evaluation
- Evidence generation and signing
- Audit log recording

**Estimated Time:** 2-4 hours
**Pass Criteria:** 100% of tests pass

**Example Tests:**
- Load a valid contract, verify it parses correctly
- Propose an action, verify it gets an ID and status
- Evaluate a simple policy constraint (environment == staging)
- Generate evidence, verify it has 18 fields and valid signature
- Verify evidence is in audit log

### Level 2: Standard

Verify approval flows and delegation chains work correctly.

**Test Areas:**
- Approval state machine transitions
- Multi-signer approval
- Authority delegation and revocation
- Credential broker integration
- Action execution with real calls

**Estimated Time:** 6-10 hours
**Pass Criteria:** 100% of tests pass

**Example Tests:**
- Propose action with 2-signer requirement, verify both must approve before execution
- Create delegation, verify delegatee can approve actions within scope
- Revoke delegation, verify it no longer works
- Inject credentials via environment variables
- Execute action on mock HTTP API, verify request sent with correct headers

### Level 3: Advanced

Verify complex scenarios and edge cases.

**Test Areas:**
- Cross-organization federation
- Rate limiting and quota enforcement
- Escalation and manual override
- External attestation
- Disaster recovery (database failure, gateway restart)

**Estimated Time:** 10-20 hours
**Pass Criteria:** 100% of tests pass

**Example Tests:**
- Org A delegates to Org B, verify B can execute A's actions within scoped constraints
- Set rate limit to 5 per hour, verify 6th execution is rejected
- Propose action with no matching contract, verify escalated to human review
- Attest evidence to external backend, verify anchor recorded
- Kill database, restart gateway, verify audit log is consistent

### Level 4: Certified

Verify production-grade security and performance.

**Test Areas:**
- Cryptographic key management and rotation
- Threat model mitigations (see Security section)
- Performance under load (1000 req/sec)
- Concurrent approval handling
- Evidence integrity and audit trail immutability

**Estimated Time:** 20+ hours
**Pass Criteria:** 100% of tests pass + security audit + load testing

**Example Tests:**
- Rotate gateway signing key, verify old evidence still verifies with old key
- Test privilege escalation attacks (see Threat Model), verify all blocked
- Generate 1000 actions/sec, verify all execute correctly
- Have 10 different signers approve simultaneously, verify no race conditions
- Try to modify audit log directly, verify audit hash fails verification

## Test Suite

The ATP conformance test suite is available on GitHub:

```bash
# Clone
git clone https://github.com/ATP-Protocol/atp-conformance.git
cd atp-conformance

# Install
npm install

# Run tests
npm run test:basic
npm run test:standard
npm run test:advanced
npm run test:certified
```

### Test Structure

Each level has multiple test files:

```
tests/
├── basic/
│   ├── contracts.test.ts
│   ├── actions.test.ts
│   ├── policy.test.ts
│   ├── evidence.test.ts
│   └── audit.test.ts
├── standard/
│   ├── approval.test.ts
│   ├── authority.test.ts
│   ├── credentials.test.ts
│   └── execution.test.ts
├── advanced/
│   ├── federation.test.ts
│   ├── rate-limiting.test.ts
│   ├── escalation.test.ts
│   ├── attestation.test.ts
│   └── recovery.test.ts
└── certified/
    ├── cryptography.test.ts
    ├── security.test.ts
    ├── performance.test.ts
    └── concurrent.test.ts
```

## Running the Test Suite

### Against Reference Implementation

The test suite includes a mock ATP for baseline testing:

```bash
npm run test:basic -- --target=mock
```

### Against Your Implementation

Point tests to your gateway:

```bash
# Set gateway URL
export ATP_GATEWAY_URL=http://your-gateway:8080

# Run tests
npm run test:level --level=basic
npm run test:level --level=standard
npm run test:level --level=advanced
npm run test:level --level=certified
```

### With Docker

```bash
# Start your gateway and dependency services
docker-compose up -d

# Run conformance tests
docker run --rm \
  --network atp-network \
  -e ATP_GATEWAY_URL=http://atp-gateway:8080 \
  atp-conformance:latest \
  npm run test:level -- --level=basic
```

## Test Results

Tests output a detailed report:

```
=== ATP Conformance Report ===

Level: BASIC
Duration: 2h 15m
Status: PASS (47/47 tests)

Test Results:
  ✓ contract-validation (5 tests, 234ms)
  ✓ action-proposal (8 tests, 456ms)
  ✓ policy-evaluation (12 tests, 789ms)
  ✓ evidence-generation (15 tests, 567ms)
  ✓ audit-logging (7 tests, 345ms)

Metrics:
  Avg latency: 45ms
  P99 latency: 234ms
  Throughput: 450 req/sec
  Error rate: 0%

Recommendations:
  - All basic tests pass
  - Ready for Level 2 certification
```

## Certification Process

To officially certify your ATP implementation:

1. **Run test suite** at your target level (must pass 100%)
2. **Submit results** to ATP registry with:
   - Test output (JSON format)
   - Implementation details (language, deployment)
   - Contact info
3. **Security audit** (for Level 3 and 4):
   - Submit code or evidence of external audit
   - Threat model review
4. **Review** by ATP maintainers (1-2 weeks)
5. **Certification** issued publicly

### Submission

```bash
# Export test results
npm run test:level -- --level=basic --output=results.json

# Submit
curl -X POST https://registry.atp-protocol.org/api/v1/certifications \
  -F "implementation_name=My ATP Gateway" \
  -F "level=basic" \
  -F "results=@results.json" \
  -F "contact_email=ops@example.com"
```

## Coverage

The test suite covers:

| Aspect | Coverage |
|--------|----------|
| Contract validation | 100% |
| Policy constraints | All 8 types |
| Approval state machine | All transitions |
| Authority model | Chains up to 5 levels deep |
| Credential injection | All 5 methods |
| Evidence generation | All 18 fields + signatures |
| External attestation | S3 Glacier, managed services |
| Error handling | 50+ error scenarios |
| Concurrency | 100+ concurrent operations |
| Performance | Latency, throughput, memory |

## Extending the Test Suite

You can add custom tests for your implementation:

```typescript
// my-custom-tests.ts
import { ATP } from '@atp-protocol/sdk';
import { assert } from 'chai';

describe('My Custom Tests', () => {
  let atp: ATP;

  beforeEach(() => {
    atp = new ATP({
      gatewayUrl: process.env.ATP_GATEWAY_URL,
    });
  });

  it('should handle my custom action type', async () => {
    const action = await atp.actions.propose({
      type: 'custom.operation',
      target: { id: '123' }
    });
    assert(action.id);
  });
});
```

Run custom tests:

```bash
npm run test -- --glob='**/my-custom-tests.ts'
```

## Known Issues & Workarounds

### Test Flakiness

Some tests are timing-sensitive. If tests occasionally fail:

1. Increase timeout: `--timeout=10000`
2. Reduce parallelism: `--jobs=1`
3. Check database health: `SELECT 1;`

### Performance Tests

Performance tests assume:
- Database on same network (< 5ms latency)
- Gateway on modern hardware (4+ CPU cores, 8GB RAM)
- No other workloads running

If hardware is limited, adjust expectations or run on larger instance.

### Attestation Backend Tests

Attestation backend tests require:
- Configured attestation backend (staging)
- Proper API credentials for backend access
- Test environment (not production)

Set environment:
```bash
export ATTESTATION_BACKEND_URL=https://staging-attestation.example.com
export ATTESTATION_API_KEY=your-test-key
```

## Next Steps

- **[Testing Guide](./testing.md)** — How to write custom tests
- **[Certification](./certification.md)** — How to get certified
- **[Gateway Deployment](../gateway/deployment.md)** — Deploy your implementation
- **[Quick Start](../quick-start.md)** — Build your first ATP action
