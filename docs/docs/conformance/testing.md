---
sidebar_position: 3
---

# Testing Guide

How to run the ATP conformance test suite and write custom tests.

## Quick Start

```bash
# Clone conformance suite
git clone https://github.com/ATP-Protocol/atp-conformance.git
cd atp-conformance

# Install dependencies
npm install

# Set gateway URL
export ATP_GATEWAY_URL=http://localhost:8080

# Run Level 1 tests
npm run test:basic
```

## Running Tests

### By Level

```bash
# Run all tests for a level
npm run test:basic        # Level 1
npm run test:standard     # Level 2
npm run test:advanced     # Level 3
npm run test:certified    # Level 4
```

### By Category

```bash
# Run specific test files
npm run test -- tests/basic/contracts.test.ts
npm run test -- tests/standard/approval.test.ts
npm run test -- tests/advanced/federation.test.ts
```

### Specific Test

```bash
# Run single test
npm run test -- --grep "should evaluate environment constraint"
```

### With Options

```bash
# Verbose output
npm run test -- --reporter=spec

# Fail fast (stop on first failure)
npm run test -- --bail

# Run in parallel
npm run test -- --jobs=4

# Increase timeout (for slow systems)
npm run test -- --timeout=10000

# Save results to file
npm run test -- --reporter=json > results.json
```

## Test Output

Standard output:

```
  Level 1: Basic
    Contract Management
      ✓ should load valid JSON contract
      ✓ should reject invalid JSON
      ✓ should validate required fields
      ...
    Action Proposal
      ✓ should propose action with required fields
      ...
    Policy Evaluation
      ...
    Evidence Generation
      ...
    Audit Logging
      ...

  47 passing (2.3s)
```

JSON output (with `--reporter=json`):

```json
{
  "stats": {
    "suites": 5,
    "tests": 47,
    "passes": 47,
    "failures": 0,
    "duration": 2300
  },
  "tests": [
    {
      "title": "should load valid JSON contract",
      "fullTitle": "Level 1: Basic > Contract Management > should load valid JSON contract",
      "state": "passed",
      "duration": 45
    },
    ...
  ]
}
```

## Configuration

Create `test-config.json`:

```json
{
  "gateway_url": "http://localhost:8080",
  "organization": "com.test",
  "timeout_ms": 30000,
  "log_level": "info",
  "database": {
    "url": "postgres://user:pass@localhost:5432/atp_test",
    "reset_between_tests": true
  },
  "blockchain": {
    "enabled": true,
    "chain": "ethereum",
    "testnet": true
  }
}
```

Or environment variables:

```bash
export ATP_GATEWAY_URL=http://localhost:8080
export ATP_ORG=com.test
export ATP_TIMEOUT_MS=30000
export ATP_LOG_LEVEL=info
export ATP_DB_URL=postgres://user:pass@localhost/atp_test
export ATP_BLOCKCHAIN_TESTNET=true
```

## Writing Custom Tests

### Test Structure

```typescript
import { ATP } from '@atp-protocol/sdk';
import { assert, expect } from 'chai';

describe('My Custom Tests', () => {
  let atp: ATP;

  before(async () => {
    // Setup once for all tests
    atp = new ATP({
      gatewayUrl: process.env.ATP_GATEWAY_URL,
    });
  });

  beforeEach(async () => {
    // Reset before each test
    await atp.reset?.();
  });

  it('should do something', async () => {
    // Arrange
    const contract = { /* ... */ };

    // Act
    const result = await atp.contracts.register(contract);

    // Assert
    assert.exists(result.id);
  });

  after(async () => {
    // Cleanup
    await atp.close?.();
  });
});
```

### Common Test Patterns

#### Testing Contract Validation

```typescript
it('should reject invalid contract', async () => {
  const invalidContract = {
    // Missing required field "id"
    version: '1.0.0',
    organization: 'com.test',
  };

  const validation = Contract.from(invalidContract).validate();
  assert.isFalse(validation.valid);
  assert.include(validation.errors[0].message, 'id');
});
```

#### Testing Action Proposal

```typescript
it('should propose action', async () => {
  const action = await atp.actions.propose({
    type: 'user.delete',
    target: { userId: '123' },
    metadata: { reason: 'testing' }
  });

  assert.exists(action.id);
  assert.equal(action.status, 'proposed');
  assert.exists(action.created_at);
});
```

#### Testing Policy Evaluation

```typescript
it('should reject non-matching environment', async () => {
  const contract = {
    version: '1.0.0',
    actions: [{
      type: 'user.delete',
      constraints: [{
        type: 'environment',
        value: 'staging',
        operator: 'eq'
      }]
    }]
  };

  const action = {
    type: 'user.delete',
    target: { userId: '123' },
    metadata: { environment: 'production' }
  };

  try {
    await atp.actions.propose(action); // Should fail
    assert.fail('Should have rejected');
  } catch (error) {
    assert.include(error.message, 'policy');
  }
});
```

#### Testing Approval Flow

```typescript
it('should require all signers', async () => {
  const contract = {
    approval_flow: {
      required_signers: 2,
      signers: ['alice@test.com', 'bob@test.com']
    }
  };

  const action = await atp.actions.propose({
    type: 'user.delete',
    target: { userId: '123' }
  });

  // Alice approves
  await atp.actions.approve(action.id, { signer: 'alice@test.com', signature: '...' });
  let status = await atp.actions.get(action.id);
  assert.equal(status.status, 'proposed'); // Still waiting for Bob

  // Bob approves
  await atp.actions.approve(action.id, { signer: 'bob@test.com', signature: '...' });
  status = await atp.actions.get(action.id);
  assert.equal(status.status, 'approved');
});
```

#### Testing Execution

```typescript
it('should execute approved action', async () => {
  // Propose, approve, then execute
  const action = await atp.actions.propose({
    type: 'user.delete',
    target: { userId: '123' }
  });

  const approved = await atp.actions.approve(action.id, sig);
  const executed = await atp.actions.execute(action.id);

  assert.equal(executed.status, 'attested');
  assert.equal(executed.outcome, 'success');
});
```

#### Testing Concurrency

```typescript
it('should handle concurrent approvals', async () => {
  const actions = [];
  for (let i = 0; i < 10; i++) {
    const action = await atp.actions.propose({
      type: 'user.delete',
      target: { userId: `user-${i}` }
    });
    actions.push(action);
  }

  // Approve all concurrently
  const approvals = actions.map(a =>
    atp.actions.approve(a.id, sig)
  );
  const results = await Promise.all(approvals);

  results.forEach(r => assert.equal(r.status, 'approved'));
});
```

## Test Utilities

Helper functions for common operations:

```typescript
import {
  createTestContract,
  createTestAction,
  createTestSignature,
  waitForStatus,
  mockCredentialBroker
} from '@atp-protocol/sdk/testing';

it('should execute with mocked credentials', async () => {
  // Mock credential broker
  mockCredentialBroker({
    'database-password': 'test-secret'
  });

  const action = await atp.actions.propose({
    type: 'database.backup',
    target: { database: 'users' }
  });

  const approved = await atp.actions.approve(action.id, sig);
  
  // Credentials are automatically injected
  const executed = await atp.actions.execute(action.id);
  assert.equal(executed.outcome, 'success');
});
```

## Debugging Tests

### Enable Debug Logging

```bash
DEBUG=atp:* npm run test
```

### Run Single Test

```bash
npm run test -- --grep "should evaluate environment constraint"
```

### Inspect Values

```typescript
it('should do something', async () => {
  const action = await atp.actions.propose({...});
  
  console.log('Action:', JSON.stringify(action, null, 2));
  
  assert.exists(action.id);
});
```

Run with output:
```bash
npm run test -- --reporter=spec
```

### Use Debugger

```typescript
it('should do something', async () => {
  debugger;  // Breakpoint
  const action = await atp.actions.propose({...});
});
```

Run with Node debugger:
```bash
node --inspect-brk ./node_modules/.bin/mocha tests/...
```

## CI/CD Integration

### GitHub Actions

```yaml
name: Conformance Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'

      - run: npm install
      - run: npm run test:basic
      - run: npm run test:standard
      - run: npm run test:advanced

      - name: Upload results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: test-results
          path: results.json
```

### GitLab CI

```yaml
test:
  image: node:18
  services:
    - postgres:15
  script:
    - npm install
    - npm run test:basic
    - npm run test:standard
    - npm run test:advanced
  artifacts:
    reports:
      junit: results.json
```

## Next Steps

- **[Levels](./levels.md)** — Detailed requirements per level
- **[Certification](./certification.md)** — Get officially certified
- **[Overview](./overview.md)** — Conformance overview
