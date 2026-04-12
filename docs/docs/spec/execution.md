---
sidebar_position: 7
---

# Section 9: Execution Semantics

**Execution Semantics** defines how an approved action is actually executed. It covers the mediation model, 6 outcome types, idempotency guarantees, and error handling.

## Execution Pipeline

When an action moves to the Executing state, ATP follows this 8-step pipeline:

```
1. Credential Injection
   ↓
2. Pre-Execution Hooks
   ↓
3. Action Mediation
   ↓
4. External System Call
   ↓
5. Result Capture
   ↓
6. Post-Execution Hooks
   ↓
7. Evidence Generation
   ↓
8. State Persistence
```

## Step 1: Credential Injection

ATP fetches credentials from the credential broker and injects them into the execution context. See [Credential Brokerage](./credentials.md) for details.

**Timeout:** 5 seconds max
**On failure:** Abort execution, mark as exec_failed

## Step 2: Pre-Execution Hooks

(Optional) Run user-defined hooks before execution. Use cases:
- Log the action to a side system
- Prime caches
- Validate target resource still exists

```json
"execution_hooks": {
  "pre_execution": [
    {
      "type": "webhook",
      "url": "https://logging.acme.com/log",
      "method": "POST"
    }
  ]
}
```

**Timeout:** 10 seconds max per hook
**On failure:** Log the hook failure but continue (non-fatal)

## Step 3: Action Mediation

The **mediation model** is how ATP translates an action intent into a concrete operation on the target system.

For each action type, there's a mediation function. For example:

**Action:** `user.delete`
**Mediation:** DELETE /api/users/{userId}

**Action:** `database.backup`
**Mediation:** BACKUP DATABASE {database_name}

**Action:** `infra.provision`
**Mediation:** terraform apply -var="count={count}"

The mediation function takes:
- Action type
- Target resource
- Parameters
- Injected credentials

And produces:
- Concrete system operation
- Parameters for the external system

## Step 4: External System Call

ATP calls the target system with the mediated operation.

**Protocol:** HTTP, gRPC, database connection, SSH, or custom protocol defined by the mediation function

**Timeout:** Configurable per action type, default 300 seconds

**Retries:** No automatic retries. If the call fails, the action fails. (Agent can propose a new action to retry.)

**Example:**
```bash
curl -X DELETE https://api.acme.com/users/12345 \
  -H "Authorization: Bearer $DB_PASSWORD" \
  -H "X-ATP-Action-ID: action-xyz"
```

## Step 5: Result Capture

ATP captures the result from the external system:

```json
{
  "status_code": 200,
  "response_body": {
    "user_id": "12345",
    "deleted_at": "2026-03-15T14:35:00Z",
    "data_retention_days": 30
  },
  "response_headers": {
    "X-Request-ID": "req-xyz"
  },
  "execution_time_ms": 250
}
```

**Interpretation:** ATP interprets the result to determine success or failure.

**Success criteria:**
- HTTP 2xx status code
- Database: no error returned
- Custom protocol: success flag set

**Failure criteria:**
- HTTP 4xx or 5xx status code
- Database error
- Timeout
- Network failure

## Outcome Types

ATP classifies action results into 6 outcome types:

### 1. Success

Action executed successfully. Target system returned success.

```json
{
  "action_id": "action-12345",
  "outcome": "success",
  "result": { /* ... */ },
  "timestamp": "2026-03-15T14:35:00Z"
}
```

### 2. Partial Success

Action executed and modified some (but not all) targets.

**Use case:** Batch delete of 100 users. 95 succeeded, 5 failed due to constraint violations.

```json
{
  "outcome": "partial_success",
  "success_count": 95,
  "failure_count": 5,
  "failures": [
    {
      "target": "user-456",
      "reason": "User has active sessions"
    }
  ]
}
```

### 3. Failure

Action failed. Target system returned an error. No state change occurred (or state change was rolled back).

```json
{
  "outcome": "failure",
  "error_code": "DATABASE_LOCKED",
  "error_message": "Database is locked. Try again later.",
  "retryable": true
}
```

### 4. Idempotent Repeat

The action was already executed previously, and this is a repeat of the same action. ATP detected this via idempotency key and returned the same result.

```json
{
  "outcome": "idempotent_repeat",
  "original_action_id": "action-99999",
  "original_execution_time": "2026-03-15T14:30:00Z",
  "result": { /* same as original */ }
}
```

**Idempotency key:** Computed from action type + target + parameters. Same key = same operation, safe to repeat.

### 5. Not Applicable

The action is no longer applicable (target no longer exists, conditions changed, etc.)

```json
{
  "outcome": "not_applicable",
  "reason": "User 12345 does not exist"
}
```

### 6. Aborted

ATP aborted the action before it reached the external system (e.g., credential injection failed, pre-execution hook timed out).

```json
{
  "outcome": "aborted",
  "reason": "Credential injection timeout",
  "phase": "credential_injection"
}
```

## Idempotency

Actions MUST be idempotent. If the same action is executed twice:

1. First execution: action runs, system state changes, evidence recorded
2. Second execution: ATP detects same action (via idempotency key), returns same evidence without re-executing

**Idempotency key formula:**
```
idempotency_key = SHA256(action_type + target + parameters)
```

Example:
```
action_type: "user.delete"
target: "user-12345"
parameters: {}
→ idempotency_key: "a1b2c3d4..."
```

ATP checks: "Have I executed an action with this idempotency key before?"
- Yes: Return cached result
- No: Execute and cache result

This prevents accidental duplicate executions if approval is received multiple times, or if the network retries a request.

## Post-Execution Hooks

(Optional) Run user-defined hooks after execution completes (success or failure).

```json
"execution_hooks": {
  "post_execution": [
    {
      "type": "webhook",
      "url": "https://slack.com/api/chat.postMessage",
      "method": "POST",
      "body": {
        "channel": "#ops",
        "text": "User deletion completed: {outcome}"
      }
    }
  ]
}
```

**Timeout:** 10 seconds max per hook
**On failure:** Log the hook failure, but don't fail the overall action (post-execution hooks are non-critical)

## Error Handling

Different error types are handled differently:

### Retryable Errors
- Database locked
- Network timeout
- Temporary service unavailable

**Handling:** Log the error, mark action as failed, suggest retry. Agent can propose a new action.

### Non-Retryable Errors
- Authentication failed
- Authorization denied
- Resource not found
- Invalid parameters

**Handling:** Log the error, mark action as failed, do NOT suggest retry. Human review needed.

### Abort Errors
- Credential injection failed
- Pre-execution hook timeout
- Mediation lookup failed

**Handling:** Mark action as aborted, don't call external system. Investigate credential broker or hook health.

## Execution Guarantees

### At-Most-Once
Each action executes at most once. Idempotency prevents duplicates.

### Not Atomically

If the action modifies multiple resources, there's no guarantee all succeed or all fail together. (Use transactions in the target system if you need atomicity.)

### Crash Recovery

If ATP crashes during execution:
- In-progress actions stay in "executing" state
- On recovery, ATP resumes:
  - If credential TTL hasn't expired: continue
  - If credential TTL has expired: abort (fail-closed)
  - If external system operation might have succeeded: check status and reconcile

## Monitoring

ATP exposes metrics for execution:

```
atp.execution.duration_ms
atp.execution.outcome (success, partial_success, failure, etc.)
atp.execution.retryable_errors
atp.execution.abort_errors
atp.credential_injection.failures
```

Monitor these to detect patterns (e.g., sudden spike in credential injection failures).

## SDK Usage

Execute an approved action:

```typescript
import { ATP } from '@atp-protocol/sdk';

const atp = new ATP({ /* ... */ });

const action = await atp.actions.propose({
  type: 'user.delete',
  target: { userId: '12345' },
});

// Wait for approval
const approved = await atp.actions.waitForApproval(action.id);

if (approved.status === 'approved') {
  // Execute
  const executed = await atp.actions.execute(action.id);
  
  console.log(executed.status); // "executing" → "attested"
  console.log(executed.outcome); // "success", "failure", etc.
  
  if (executed.outcome === 'success') {
    console.log('Action succeeded:', executed.result);
  } else if (executed.outcome === 'failure') {
    console.log('Action failed:', executed.error_message);
    console.log('Retryable:', executed.retryable);
  }
}
```

## Best Practices

1. **Make actions idempotent** — Design operations to be safe to repeat
2. **Use idempotency keys** — Don't execute the same action twice
3. **Set appropriate timeouts** — Long enough to complete, short enough to fail fast
4. **Monitor outcomes** — Alert on unusual failure rates
5. **Test error paths** — Make sure non-retryable errors are handled correctly
6. **Use post-execution hooks carefully** — Don't make them critical to success
7. **Log all executions** — Full detail for debugging and audit

## Next Steps

- [Evidence & Attestation](./evidence.md) — Learn what evidence is captured after execution
