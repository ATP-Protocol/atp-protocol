---
sidebar_position: 4
---

# Section 6: Policy Evaluation

**Policy Evaluation** is how ATP decides whether a proposed action is allowed. It's the gatekeeper between agent intent and system execution. This section defines 8 constraint types and the evaluation algorithm.

## Overview

When an action is proposed, ATP looks up the contract that governs it and evaluates all constraints in the contract. If all constraints are satisfied, the action passes policy evaluation and moves to approval. If any constraint fails, the action is rejected immediately.

## 8 Constraint Types

### 1. Temporal Constraints: Time of Day

Restrict actions to specific hours of the day.

```json
{
  "type": "time_of_day",
  "start": "09:00",
  "end": "17:00",
  "timezone": "America/New_York"
}
```

**Validation:**
- `start` and `end` are HH:MM format (24-hour)
- Both are in the specified timezone
- Action is allowed if `start <= current_time <= end`

**Use case:** Prevent automated deletions outside business hours when on-call support can respond.

### 2. Temporal Constraints: Day of Week

Restrict actions to specific days.

```json
{
  "type": "day_of_week",
  "days": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
  "timezone": "America/New_York"
}
```

**Validation:**
- `days` is an array of day names or numbers (0-6, where 0 = Sunday)
- Action is allowed if today is in `days`

**Use case:** Only allow deployments on weekdays when engineers are available.

### 3. Quantitative Constraints: Rate Limiting

Limit how many times an action can occur in a time window.

```json
{
  "type": "rate_limit",
  "value": 100,
  "window": "1h"
}
```

**Fields:**
- `value` (integer): Maximum count
- `window` (string): Time window in format `<number><unit>` where unit is `s` (second), `m` (minute), `h` (hour), `d` (day), `w` (week)

**Validation:**
- Count actions of this type in the past `window` seconds
- If count >= `value`, reject
- Otherwise, allow and increment counter

**Use case:** Prevent runaway deletion loops or DoS attacks.

### 4. Quantitative Constraints: Dollar Limit

Restrict total transaction value.

```json
{
  "type": "dollar_limit",
  "value": 5000.00,
  "currency": "USD",
  "window": "24h"
}
```

**Fields:**
- `value` (float): Maximum dollars
- `currency` (string): ISO 4217 code
- `window` (string): Aggregation window (same format as rate_limit)

**Validation:**
- Sum transaction amounts in the past `window`
- If sum >= `value`, reject
- Otherwise, allow and update sum

**Use case:** Cap daily spending on cloud resources or infrastructure provisioning.

### 5. Categorical Constraints: Environment

Restrict actions to specific environments.

```json
{
  "type": "environment",
  "value": "staging",
  "operator": "eq"
}
```

or

```json
{
  "type": "environment",
  "values": ["staging", "development"],
  "operator": "in"
}
```

**Fields:**
- `value` or `values`: Environment name(s)
- `operator`: `eq`, `ne`, `in`, `not_in`

**Validation:**
- Extract `environment` from the action metadata
- Compare using the specified operator
- If match, allow; otherwise reject

**Use case:** Prevent destructive actions in production.

### 6. Categorical Constraints: Resource Type

Restrict actions to specific resource types.

```json
{
  "type": "resource_type",
  "values": ["database", "queue"],
  "operator": "in"
}
```

**Fields:**
- `values`: Array of resource types
- `operator`: `eq`, `ne`, `in`, `not_in`

**Validation:**
- Extract `resource_type` from action metadata
- Compare using operator

**Use case:** Only allow deletions on test databases, not production databases.

### 7. Delegation Constraint: Authority

Verify that the approver has proper authority.

```json
{
  "type": "delegation",
  "required_role": "security-officer"
}
```

**Validation:**
- Check if the approving wallet has delegation chain to `required_role`
- If yes, allow; otherwise reject

**Use case:** Require approval from specific roles (CSO, compliance officer) for sensitive actions.

### 8. Custom Constraint: Webhook

Call an external service to decide.

```json
{
  "type": "webhook",
  "url": "https://policy.acme.com/check",
  "method": "POST",
  "timeout_ms": 5000
}
```

**Validation:**
- HTTP POST to the URL with action payload
- If response is HTTP 200 and body is `{"allow": true}`, allow the action
- If response is non-200 or timeout, reject the action
- Timeout is mandatory (max 5 seconds)

**Use case:** Delegate policy decisions to specialized services (compliance, fraud detection, ML models).

## Policy Merging Rules

A contract can have multiple constraints on the same action type. When evaluating, ATP applies these rules:

1. **Multiple constraints of the same type:** AND them together
   - Rate limit 100/hour AND environment must be staging → BOTH must pass

2. **Different constraint types:** AND them together
   - Time-of-day AND environment AND rate-limit → ALL must pass

3. **Constraint arrays:** AND them together
   - Multiple time_of_day constraints → ALL time windows must be satisfied (effectively takes intersection)

## Evaluation Algorithm

```
function evaluate_policy(action, contract):
  1. For each constraint in contract:
       a. If temporal constraint:
          i. Check current time against start/end or day list
          ii. If outside bounds, REJECT
       b. If quantitative constraint:
          i. Check counters or sums in state database
          ii. If limit exceeded, REJECT
       c. If categorical constraint:
          i. Extract field from action metadata
          ii. Compare with operator
          iii. If doesn't match, REJECT
       d. If delegation constraint:
          i. Check approver's delegation chain
          ii. If missing required role, REJECT
       e. If webhook constraint:
          i. Call external service with timeout
          ii. If service returns false or times out, REJECT
  2. If all constraints pass, allow action
  3. Record evaluation result in audit log
  4. Return ALLOW or REJECT
```

## Short-Circuit Evaluation

ATP evaluates constraints in order. As soon as one constraint fails, evaluation stops and the action is rejected. This is a security feature: even if later constraints have bugs, a failed constraint earlier stops the action.

Constraint order in contracts SHOULD follow criticality (most important first):

```json
"constraints": [
  { "type": "environment", "value": "staging" },  // Most critical
  { "type": "rate_limit", "value": 100, "window": "1h" },
  { "type": "time_of_day", "start": "09:00", "end": "17:00" },
  { "type": "dollar_limit", "value": 1000.00, "window": "24h" }  // Least critical
]
```

## Constraint Examples

### Example 1: User Deletion in Staging Only

```json
{
  "type": "user.delete",
  "constraints": [
    {
      "type": "environment",
      "value": "staging",
      "operator": "eq"
    }
  ]
}
```

Action allows deletion only if `environment == "staging"`.

### Example 2: Rate-Limited Cloud Provisioning

```json
{
  "type": "infra.provision",
  "constraints": [
    {
      "type": "rate_limit",
      "value": 10,
      "window": "1h"
    },
    {
      "type": "dollar_limit",
      "value": 25000.00,
      "currency": "USD",
      "window": "30d"
    }
  ]
}
```

Action allows provisioning max 10 times per hour and max $25k per month.

### Example 3: Business Hours Only in Production

```json
{
  "type": "database.restore",
  "constraints": [
    {
      "type": "environment",
      "value": "production",
      "operator": "eq"
    },
    {
      "type": "time_of_day",
      "start": "09:00",
      "end": "17:00",
      "timezone": "America/New_York"
    },
    {
      "type": "day_of_week",
      "days": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
    }
  ]
}
```

Action allows restoration in production only during US business hours on weekdays.

### Example 4: Webhook-Based Compliance Check

```json
{
  "type": "data.export",
  "constraints": [
    {
      "type": "webhook",
      "url": "https://compliance.acme.com/api/check-export",
      "method": "POST",
      "timeout_ms": 3000
    }
  ]
}
```

Before exporting data, call the compliance service. If it returns `{"allow": true}`, proceed. Otherwise, reject.

## State Management

Constraints that need counters (rate limits, dollar limits) rely on ATP state:

```json
{
  "action_type": "user.delete",
  "timestamp": "2026-03-15T14:30:00Z",
  "window_key": "1h",
  "count": 25,
  "max_allowed": 100
}
```

ATP maintains this state in its database and updates it after each action execution. State is atomic: if an action is rejected, state is not modified.

## SDK Usage

Evaluate policies programmatically:

```typescript
import { Policy, Constraint } from '@atp-protocol/sdk';

const contract = require('./contract.json');

// Proposed action
const action = {
  type: 'user.delete',
  target: { userId: '12345' },
  metadata: {
    environment: 'staging',
  },
  timestamp: new Date(),
};

// Evaluate
const policy = new Policy(contract.actions[0].constraints);
const evaluation = await policy.evaluate(action);

if (evaluation.allowed) {
  console.log('Action passed all policy constraints');
} else {
  console.log('Action rejected:', evaluation.failed_constraint);
  console.log('Reason:', evaluation.reason);
}
```

## Best Practices

1. **Fail closed** — If a constraint fails, reject the action
2. **Log all evaluations** — Record passes and failures for audit
3. **Use webhooks sparingly** — They add latency; prefer built-in constraints
4. **Set reasonable timeouts** — 5 seconds max for webhooks
5. **Monitor constraint violations** — Alert on unusual rejection patterns
6. **Review constraints regularly** — Are they too strict? Too loose?
7. **Test edge cases** — Rate limit boundaries, timezone edge cases

## Next Steps

- [Contracts](./contracts.md) — Learn how constraints are specified
- [Approval State Machine](./approval.md) — See what happens after policy passes
