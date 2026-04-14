---
sidebar_position: 2
---

# Conformance Levels Detailed

This page provides a detailed breakdown of each conformance level with specific test requirements and success criteria.

## Level 1: Basic

**Target Audience:** Early integrations, sandboxes, testing

**Duration:** 2-4 hours
**Cost:** Free
**Renewal:** Yearly

### Requirements

#### 1.1 Contract Management
- [x] Load valid JSON contract
- [x] Reject invalid JSON contract
- [x] Validate required fields (version, id, organization, title, actions, approval_flow, validity)
- [x] Validate action constraints syntax
- [x] Verify contract signatures
- [x] Accept contract with 1+ valid signatures
- [x] Reject contract with invalid signatures

#### 1.2 Action Proposal
- [x] Propose action with required fields
- [x] Assign unique action ID
- [x] Set initial status to "proposed"
- [x] Record proposal timestamp
- [x] Assign to correct signer wallet
- [x] Reject action with invalid type
- [x] Reject action with missing target
- [x] Retrieve action by ID
- [x] List actions (with filtering by status, signer)

#### 1.3 Policy Evaluation
- [x] Evaluate environment constraint (eq, ne, in, not_in)
- [x] Evaluate rate_limit constraint
- [x] Evaluate time_of_day constraint
- [x] Evaluate day_of_week constraint
- [x] Evaluate dollar_limit constraint
- [x] Reject on any constraint failure
- [x] Allow on all constraints passing
- [x] Short-circuit evaluation (stop on first failure)

#### 1.4 Evidence Generation
- [x] Generate evidence with all 18 required fields
- [x] Compute evidence hash correctly
- [x] Sign evidence with gateway key
- [x] Verify signature on evidence
- [x] Include all fields:
  - evidence_id, action_id, timestamp, action_type, target
  - organization, signer_wallet, approvers, contract_id, environment
  - execution_time_ms, outcome, result_hash, result_summary
  - error_code, error_message, evidence_hash, signature
- [x] Use microsecond precision timestamps
- [x] Generate unique evidence IDs

#### 1.5 Audit Logging
- [x] Record all actions in audit log
- [x] Record all approvals in audit log
- [x] Record all executions in audit log
- [x] Append-only (no deletions or modifications)
- [x] Query audit log by time range
- [x] Query audit log by signer
- [x] Verify audit log integrity

### Pass Criteria

All tests pass:
- 47 total tests across 5 areas
- 0 failures, 0 skips
- Avg latency < 100ms
- Error rate < 0.1%

### Example Test

```typescript
describe('Level 1: Basic', () => {
  it('should evaluate environment constraint', async () => {
    const action = {
      type: 'user.delete',
      target: { userId: '123' },
      metadata: { environment: 'staging' }
    };

    const constraint = {
      type: 'environment',
      value: 'staging',
      operator: 'eq'
    };

    const result = evaluateConstraint(constraint, action);
    assert.isTrue(result.allowed);
  });

  it('should reject non-matching environment', async () => {
    const action = {
      type: 'user.delete',
      target: { userId: '123' },
      metadata: { environment: 'production' }
    };

    const constraint = {
      type: 'environment',
      value: 'staging',
      operator: 'eq'
    };

    const result = evaluateConstraint(constraint, action);
    assert.isFalse(result.allowed);
    assert.equal(result.reason, 'environment mismatch');
  });
});
```

## Level 2: Standard

**Target Audience:** Production deployments, enterprise use

**Duration:** 6-10 hours
**Cost:** Free
**Renewal:** Yearly

### Requirements (includes all of Level 1, plus:)

#### 2.1 Approval State Machine
- [x] Transition: Proposed → Approved
- [x] Transition: Proposed → Rejected
- [x] Transition: Proposed → Escalated
- [x] Transition: Approved → Executing
- [x] Transition: Executing → Attested
- [x] Transition: Executing → Exec Failed
- [x] Transition: Attested → Settled (optional)
- [x] Transition: Escalated → Approved (one-time approval)
- [x] Transition: Escalated → Rejected
- [x] Enforce valid transitions only (no invalid transitions)
- [x] Timeout: Proposed → Rejected after 1 hour (configurable)
- [x] Timeout: Escalated → Rejected after 24 hours (configurable)
- [x] Escalate if no matching contract
- [x] Escalate if escalation_threshold exceeded

#### 2.2 Approval Workflow
- [x] Collect required number of signatures
- [x] Verify signatures with known keys
- [x] Reject if not enough signers
- [x] Reject if signer not in approval list
- [x] Allow early execution once all signers collected (no timeout required)
- [x] Handle signature revocation
- [x] Notify signers (mock notification)
- [x] Support multi-signer quorum (e.g., 2-of-3)

#### 2.3 Authority & Delegation
- [x] Check signer authority from contract
- [x] Create delegation from delegator to delegatee
- [x] Verify delegation with validity window
- [x] Check delegation scope constraints
- [x] Support delegation chains (A → B → C)
- [x] Revoke delegation (prevents future use)
- [x] Reject if delegation expired
- [x] Support scoped delegations (action types, environments)

#### 2.4 Credential Brokerage
- [x] Fetch credentials from broker before execution
- [x] Inject credentials via environment variables
- [x] Clean up credentials after execution (no leakage)
- [x] Fail-closed if credential not found
- [x] Fail-closed if credential injection fails
- [x] Support credential TTL (time-to-live)
- [x] Support multiple credentials in one action
- [x] Log all credential access in audit trail

#### 2.5 Action Execution
- [x] Call external system after approval
- [x] Capture execution result
- [x] Determine outcome type (success, failure, partial, etc.)
- [x] Support idempotency (same action twice = same result)
- [x] Timeout execution after configurable duration (default 300s)
- [x] Log execution time
- [x] Support pre-execution and post-execution hooks
- [x] Handle execution errors gracefully

### Pass Criteria

All tests pass:
- 100+ total tests across all areas
- 0 failures, 0 skips
- Avg latency < 200ms
- P99 latency < 1000ms
- Throughput > 500 req/sec
- Error rate < 0.01%

### Example Test

```typescript
describe('Level 2: Standard', () => {
  it('should require all signers before approval', async () => {
    const contract = {
      approval_flow: {
        required_signers: 2,
        signers: ['alice@acme.com', 'bob@acme.com']
      }
    };

    const action = await propose(contract);
    assert.equal(action.status, 'proposed');

    // Alice approves
    await approve(action.id, 'alice@acme.com', aliceKey);
    action = await getAction(action.id);
    assert.equal(action.status, 'proposed'); // Still waiting for Bob

    // Bob approves
    await approve(action.id, 'bob@acme.com', bobKey);
    action = await getAction(action.id);
    assert.equal(action.status, 'approved'); // Now approved
  });

  it('should support delegation chains', async () => {
    // Alice can approve
    let canApprove = await verify({
      approver: 'alice@acme.com',
      action_type: 'user.delete'
    });
    assert.isTrue(canApprove);

    // Alice delegates to Bob
    const delegation = {
      delegator: 'alice@acme.com',
      delegatee: 'bob@acme.com',
      scope: { actions: ['user.delete'] }
    };
    await createDelegation(delegation);

    // Bob can now approve
    canApprove = await verify({
      approver: 'bob@acme.com',
      action_type: 'user.delete'
    });
    assert.isTrue(canApprove);
  });
});
```

## Level 3: Advanced

**Target Audience:** Enterprise + compliance, multi-org federations

**Duration:** 10-20 hours
**Cost:** Free
**Renewal:** Yearly

### Requirements (includes all previous levels, plus:)

#### 3.1 Federation
- [x] Support cross-organization delegations
- [x] Verify org identity with public key
- [x] Support scoped federation (some actions, some environments)
- [x] Enforce delegation limits per org
- [x] Revoke federation at any time

#### 3.2 Rate Limiting & Quotas
- [x] Enforce rate_limit constraint
- [x] Enforce dollar_limit constraint
- [x] Use sliding windows (last N seconds)
- [x] Reject if limit exceeded
- [x] Reset counters correctly
- [x] Support multiple concurrent counters
- [x] Handle clock skew gracefully

#### 3.3 Escalation & Manual Override
- [x] Escalate if no matching contract
- [x] Escalate if policy constraint fails (optional)
- [x] Escalate if escalation_threshold exceeded
- [x] Support one-time approval for escalated actions
- [x] Route escalations to correct team
- [x] Track escalation resolution time
- [x] Alert if escalated action expires

#### 3.4 External Attestation
- [x] Submit evidence to external attestation backend
- [x] Support S3 Glacier / Azure Archive
- [x] Support managed attestation services
- [x] Record attestation anchor ID in evidence
- [x] Record anchor timestamp in evidence
- [x] Verify attested evidence with backend
- [x] Handle attestation failures gracefully

#### 3.5 Disaster Recovery
- [x] Survive database restart (no data loss)
- [x] Survive gateway restart (resume in-progress actions)
- [x] Detect database corruption
- [x] Support point-in-time recovery
- [x] Replicate audit log to backup location
- [x] Verify audit log consistency after recovery

### Pass Criteria

All tests pass:
- 150+ total tests
- 0 failures, 0 skips
- Avg latency < 300ms
- P99 latency < 2000ms
- Throughput > 300 req/sec
- Error rate < 0.001%
- External attestation success rate > 99.9%

## Level 4: Certified

**Target Audience:** Mission-critical deployments, finance, compliance-heavy

**Duration:** 20+ hours
**Cost:** $2,000 (covers review + maintenance)
**Renewal:** Yearly

### Requirements (includes all previous levels, plus:)

#### 4.1 Cryptography & Key Management
- [x] Use COSE (RFC 8152) for signing
- [x] Use ES256 (ECDSA P-256 + SHA-256) for signatures
- [x] Generate keys with CSPRNG
- [x] Rotate gateway keys every 30 days
- [x] Support key versioning (multiple active keys)
- [x] Verify signatures with correct key version
- [x] Audit all key operations
- [x] Secure key storage (encrypted at rest)

#### 4.2 Security Testing
- [x] Prevent privilege escalation (scoped authority enforced)
- [x] Prevent timing attacks (constant-time comparison)
- [x] Prevent replay attacks (idempotency + nonce)
- [x] Prevent TOCTOU (time-of-check-time-of-use) bugs
- [x] Prevent side-channel attacks
- [x] Prevent injection attacks (parameterized queries, etc.)
- [x] Prevent XSS/CSRF (N/A for API, but validate content)
- [x] Threat model review by external auditor

#### 4.3 Performance Under Load
- [x] Sustain 1000 req/sec for 1 hour
- [x] Sustain 100 concurrent approvals
- [x] Sustain 10000 evidence queries/sec
- [x] Memory usage < 1GB under load
- [x] No deadlocks or race conditions
- [x] Graceful degradation under overload
- [x] Automatic scaling (if Kubernetes)

#### 4.4 Concurrent Operations
- [x] Support 100+ concurrent action proposals
- [x] Support 50+ concurrent approvals
- [x] Support 10+ concurrent executions
- [x] Prevent race conditions in state updates
- [x] Prevent double-execution (idempotency)
- [x] Correct ordering of approval signatures
- [x] Atomic evidence generation

#### 4.5 Audit Trail Integrity
- [x] Append-only audit log (no deletions)
- [x] Detect audit log tampering (hash chains)
- [x] Verify audit log consistency after recovery
- [x] Support multi-site replication
- [x] Retain evidence for 7+ years
- [x] Compress old entries without data loss
- [x] Support GDPR data subject access requests

### Pass Criteria

All tests pass:
- 200+ total tests
- 0 failures, 0 skips
- Security audit passed (by external firm)
- Performance benchmarks met
- Load test: 1000 req/sec for 1 hour
- Concurrent test: 100+ concurrent operations

Plus:
- Code review by ATP maintainers
- Public security audit (optional but recommended)
- Deployment in production (required for certification)

### Example Level 4 Test

```typescript
describe('Level 4: Certified', () => {
  it('should handle 1000 concurrent action proposals', async () => {
    const promises = [];
    for (let i = 0; i < 1000; i++) {
      promises.push(
        atp.actions.propose({
          type: 'user.delete',
          target: { userId: `user-${i}` }
        })
      );
    }

    const results = await Promise.all(promises);
    
    // All should succeed
    assert.lengthOf(results, 1000);
    results.forEach(r => assert(r.id));

    // All should be unique
    const ids = new Set(results.map(r => r.id));
    assert.lengthOf(ids, 1000);
  });

  it('should prevent double-execution', async () => {
    const action = await atp.actions.propose({
      type: 'user.delete',
      target: { userId: '123' }
    });

    const approved = await atp.actions.waitForApproval(action.id);
    
    // Execute twice
    const result1 = await atp.actions.execute(action.id);
    const result2 = await atp.actions.execute(action.id);
    
    // Should get same result both times (idempotent)
    assert.equal(result1.outcome, result2.outcome);
    assert.equal(result1.result_hash, result2.result_hash);
  });
});
```

## Comparison Table

| Level | Duration | Tests | Latency | Throughput | Cost |
|-------|----------|-------|---------|-----------|------|
| 1 | 2-4h | 47 | <100ms | 450 req/s | Free |
| 2 | 6-10h | 100+ | <200ms | 500 req/s | Free |
| 3 | 10-20h | 150+ | <300ms | 300 req/s | Free |
| 4 | 20+h | 200+ | <300ms | 300 req/s | $2k/yr |

## Next Steps

- **[Testing Guide](./testing.md)** — How to run tests
- **[Certification](./certification.md)** — How to get certified
- **[Overview](./overview.md)** — Back to conformance overview
