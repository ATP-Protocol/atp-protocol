---
sidebar_position: 5
---

# Section 7: Approval State Machine

The **Approval State Machine** defines how actions flow through approval, execution, and attestation. It answers: "Where is this action in its lifecycle? What happens next? Who can approve it?"

## State Diagram

```
                    ┌─────────────┐
                    │  Proposed   │
                    └──────┬──────┘
                           │
                ┌──────────┼──────────┐
                ▼          ▼          ▼
           ┌────────┐ ┌─────────┐ ┌──────────┐
           │Approved│ │Escalated│ │ Rejected │
           └────┬───┘ └────┬────┘ └──────────┘
                │          │
                ▼          ▼
           ┌────────────────────┐
           │    Executing       │
           └────┬────────┬──────┘
                │        │
             PASS      FAIL
                │        │
                ▼        ▼
           ┌────────┐ ┌─────────────┐
           │Attested│ │ Exec Failed │
           └────┬───┘ └─────────────┘
                │
                ▼
           ┌──────────┐
           │ Settled  │
           └──────────┘
```

## States Explained

### Proposed
An agent has submitted an action for evaluation. ATP has validated the action format and constraints, and is waiting for approvers to sign off.

**Entry:** Agent calls `actions.propose()`

**Exit conditions:**
- Move to **Approved** if all required signers approve
- Move to **Escalated** if approval requires human review
- Move to **Rejected** if a constraint fails or approval is denied

**Timeout:** Default 1 hour. If no approval received, action expires and is marked failed.

### Approved
All required signers have approved the action. ATP is ready to execute it.

**Entry:** Required number of signers have signed the contract

**Exit conditions:**
- Move to **Executing** immediately (or stay in Approved while waiting for batch execution)
- Move to **Rejected** if a signer revokes their approval

**Duration:** Should not stay in Approved for more than a few minutes. If delayed, escalate to human attention.

### Escalated
The action doesn't match any existing contract (or requires special review). It's waiting for human decision-makers to approve or reject it.

**Entry:** No matching contract found OR `escalation_threshold` exceeded (too many automated rejections)

**Exit conditions:**
- Move to **Approved** if human approvers sign a one-time approval contract
- Move to **Rejected** if human approvers deny it

**Timeout:** Default 24 hours. If not resolved, action expires.

### Rejected
The action was rejected (either by policy, lack of approval, or human decision). No execution occurs.

**Entry:**
- Policy constraint failed
- No matching contract
- Required approvers denied
- Action timed out in Proposed state

**Exit conditions:** Terminal state. No further transitions.

**Audit:** Rejection reason is logged with full context.

### Executing
ATP is running the action. The external system (user database, cloud API, etc.) is being modified.

**Entry:** Approved action enters the execution phase

**Exit conditions:**
- Move to **Attested** if execution succeeds
- Move to **Exec Failed** if execution fails

**Duration:** Depends on the external system. Typically seconds to minutes.

**Idempotency:** If executing the same action twice, the second execution MUST be idempotent (no duplicate side effects).

### Attested
The action executed successfully and evidence has been generated and signed. The action is complete but not yet durably attested.

**Entry:** Execution succeeded, evidence signed

**Exit conditions:**
- Move to **Settled** if evidence is attested to external backend (optional)
- Or stay in Attested if external attestation is not configured

**Evidence:** Contains 18 fields (see Evidence & Attestation section)

### Exec Failed
Execution failed. ATP attempted to run the action but the external system returned an error.

**Entry:** Execution returned non-success outcome

**Exit conditions:** Terminal state. Action is not retried.

**Error details:** Failure reason logged. Agent can inspect and retry with a new action if appropriate.

### Settled
The action's evidence has been durably attested via an external backend. This creates a verifiable, immutable audit trail.

**Entry:** Evidence recorded and external attestation succeeded

**Exit conditions:** Terminal state. Action is fully settled.

**Attestation:** Evidence is recorded with an external attestation backend (immutable storage, managed services, or other durable backends)

## Transitions and Timing

### Proposed → Approved

**Condition:** All required signers approve

**Required fields:**
- Signatures from each signer
- Signature timestamp
- Key ID of signing key

**Example:**
```json
{
  "action_id": "action-12345",
  "status": "proposed",
  "approvals": [
    {
      "signer": "alice@acme.com",
      "signature": "base64-encoded",
      "timestamp": "2026-03-15T14:35:00Z",
      "key_id": "alice-2026-01"
    },
    {
      "signer": "bob@acme.com",
      "signature": "base64-encoded",
      "timestamp": "2026-03-15T14:40:00Z",
      "key_id": "bob-2026-01"
    }
  ]
}
```

### Proposed → Escalated

**Condition:** No matching contract found, or escalation_threshold exceeded

**Example:**
```
Action type "custom.operation" not found in any contract
→ Escalated for human review
Escalation ticket created: TICKET-789
Notification sent to security@acme.com
```

### Escalated → Approved (One-Time Approval)

**Condition:** Human decision-makers approve via one-time contract

**One-time approval contract:**
```json
{
  "type": "approval.one_time",
  "action_id": "action-12345",
  "signers": ["alice@acme.com", "bob@acme.com"],
  "reason": "Unusual but legitimate operation"
}
```

### Approved → Executing

**Condition:** Action moves into execution phase

**Execution parameters:**
- Credentials injected (if needed)
- External system called with action parameters
- Result captured

### Executing → Attested

**Condition:** Execution succeeded

**Evidence generated:**
- Timestamp of execution
- Execution duration
- Result/output
- Action hash
- Signer (ATP gateway)

### Executing → Exec Failed

**Condition:** Execution failed

**Failure details logged:**
- Error code
- Error message
- Partial result (if available)

## Escalation Criteria

An action is escalated when:

1. **No matching contract** — No contract exists for this action type
2. **Escalation threshold exceeded** — An action is proposed multiple times and rejected multiple times. If `escalation_threshold` is 3, and the action is rejected 3 times, escalate on the 4th proposal
3. **Amount exceeds policy** — Dollar limit or quota exceeded, requiring additional review
4. **Manual escalation** — An approver explicitly escalates for human review
5. **Unusual context** — Metadata indicates unusual circumstances (off-hours, unusual resource)

## Rejection Handling

When an action is rejected:

1. **Log the rejection** — Record who rejected, when, and why
2. **Notify the agent** — Action failure notification
3. **Increment escalation counter** — If same action proposed again, escalation counter goes up
4. **Clean up state** — Release any reserved resources
5. **Audit** — Rejection details go into audit trail

## Timeout Behavior

| State | Timeout | Action |
|-------|---------|--------|
| Proposed | 1 hour | Mark as rejected, notify agent |
| Escalated | 24 hours | Mark as rejected, notify stakeholders |
| Executing | 5 minutes | Abort execution, mark as exec failed |

Timeouts are configurable per contract:

```json
"approval_flow": {
  "required_signers": 2,
  "signers": ["alice@acme.com", "bob@acme.com"],
  "approval_timeout": 3600
}
```

## State Transition Table

| From | To | Condition | Required Data |
|------|----|-----------|----|
| Proposed | Approved | All signers sign | Signatures with timestamps |
| Proposed | Escalated | No contract or threshold | Escalation reason |
| Proposed | Rejected | Policy fail or timeout | Failure reason |
| Escalated | Approved | Human approval | One-time approval contract |
| Escalated | Rejected | Human denial | Denial reason |
| Approved | Executing | Execution begins | Credentials, parameters |
| Executing | Attested | Execution succeeds | Result, evidence |
| Executing | Exec Failed | Execution fails | Error details |
| Attested | Settled | External attestation | Attestation anchor ID |

## Example Flow: User Deletion

```
1. Agent proposes: "Delete user 12345 in staging"
   Status: Proposed
   Timestamp: 2026-03-15T14:30:00Z

2. ATP evaluates policy: environment = staging ✓, rate limit = 25/100 ✓
   Status: Still Proposed
   Waiting for approvals

3. Alice approves at 2026-03-15T14:35:00Z
   Status: Still Proposed (need 2 signatures)

4. Bob approves at 2026-03-15T14:40:00Z
   Status: Approved (all signers done)

5. ATP begins execution
   Status: Executing
   Credentials injected from broker

6. User deletion succeeds
   Status: Attested
   Evidence generated with timestamp, result hash, signer

7. Evidence attested via external backend (optional)
   Status: Settled
   Attestation backend: s3-immutable-ledger
   Anchor ID: s3://ledger/2026/03/15/evidence-abc123

Action complete. Full audit trail preserved forever.
```

## SDK Usage

Monitor action status:

```typescript
import { ATP } from '@atp-protocol/sdk';

const atp = new ATP({ /* ... */ });

// Propose an action
const action = await atp.actions.propose({
  type: 'user.delete',
  target: { userId: '12345' },
});

console.log(action.id); // "action-xyz"
console.log(action.status); // "proposed"

// Wait for approval
const updated = await atp.actions.waitForApproval(action.id, {
  timeout: 5 * 60 * 1000, // 5 minutes
});

console.log(updated.status); // "approved" or "escalated" or "rejected"

// If approved, execute
if (updated.status === 'approved') {
  const executed = await atp.actions.execute(action.id);
  console.log(executed.status); // "executing" then "attested"
}

// Check final status
const final = await atp.actions.get(action.id);
console.log(final.status); // "settled" or "exec_failed"
console.log(final.evidence); // Full evidence object
```

## Best Practices

1. **Short approval windows** — Don't wait longer than necessary
2. **Clear escalation criteria** — Document why actions escalate
3. **Monitor for stuck actions** — Alert if Proposed > 30 minutes
4. **Automate common escalations** — Create contracts for common special cases
5. **Idempotent execution** — Design actions to be safely retryable
6. **Detailed audit logs** — Log every transition with reason and metadata
7. **Test escalation paths** — Make sure manual approval flows work

## Next Steps

- [Policy Evaluation](./policy.md) — Learn what constraints cause rejection
- [Evidence & Attestation](./evidence.md) — Understand what's in evidence
