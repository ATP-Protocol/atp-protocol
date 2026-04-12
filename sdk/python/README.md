# ATP Protocol SDK for Python

A comprehensive Python SDK for the [Agent Trust Protocol (ATP)](https://atp-protocol.org), providing local validation, policy evaluation, and approval state machine management.

## Features

- **Contract Validation**: Validate ATP contracts against the specification with detailed error and warning reporting
- **Policy Evaluation**: Evaluate request parameters against contract scope constraints
- **Approval State Machine**: Manage approval flows with deterministic state transitions
- **Zero Dependencies**: Pure Python stdlib implementation with no external runtime dependencies
- **Type Safe**: Full type hints and dataclass support for better IDE support

## Installation

Install from PyPI:

```bash
pip install atp-protocol
```

## Quick Start

### Contract Validation

```python
from atp_protocol import validate_contract

contract = {
    "version": "1.0.0",
    "authority": "org.finance.approve-payment",
    "actions": ["approve-payment"],
    "attestation": "full",
}

result = validate_contract(contract)
if result.valid:
    print("Contract is valid!")
else:
    for error in result.errors:
        print(f"Error: {error.message}")
```

### Policy Evaluation

```python
from atp_protocol import evaluate_policy

contract = {
    "version": "1.0.0",
    "authority": "org.finance.approve-payment",
    "actions": ["approve-payment"],
    "attestation": "full",
    "scope": {
        "max_amount": 5000,
        "email": ["@company.com"],
    }
}

result = evaluate_policy(contract, {
    "max_amount": 3000,
    "email": "user@company.com",
})

if result.permitted:
    print("Request is permitted!")
else:
    print(f"Request denied: {result.denial_reason}")
```

### Approval Flow

```python
from atp_protocol import ApprovalFlow

flow = ApprovalFlow(
    contract_id="ctr_123",
    action="send-email",
    scope_params={"recipient": "user@example.com"},
    requesting_wallet="0xWallet",
)

# State transitions
flow.transition("deliver")  # REQUESTED -> PENDING_REVIEW
flow.transition("approve")  # PENDING_REVIEW -> APPROVED

if flow.is_approved():
    print("Approval granted, proceed to execution")
    approval_record = flow.to_record()
```

## API Reference

### `validate_contract(contract: dict) -> ValidationResult`

Validate an ATP contract. Returns a `ValidationResult` with:
- `valid: bool` - Whether the contract is valid
- `errors: List[ValidationError]` - List of validation errors
- `warnings: List[ValidationWarning]` - List of validation warnings

### `is_contract_expired(contract: dict) -> bool`

Check if a contract's expiry date has passed.

### `requires_approval(contract: dict, amount: Optional[float] = None) -> bool`

Check if a contract requires approval, optionally checking against an amount threshold.

### `parse_escalation_path(contract: dict) -> List[str]`

Parse the escalation path from a contract into an ordered list of roles.

### `evaluate_policy(contract: dict, request_params: dict) -> PolicyEvaluation`

Evaluate request parameters against a contract's scope constraints. Returns a `PolicyEvaluation` with:
- `permitted: bool` - Whether the request is permitted
- `policies_evaluated: int` - Number of constraints evaluated
- `constraints_applied: List[PolicyConstraint]` - Applied constraints
- `denial_reason: Optional[str]` - Reason for denial (if denied)

### `merge_constraints(*policy_sets: dict) -> dict`

Merge multiple policy constraint sets, applying the most restrictive rules.

### `class ApprovalFlow`

Manages approval state machine with these methods:

- `transition(trigger: str, metadata: Optional[dict] = None) -> ApprovalState` - Perform state transition
- `is_terminal() -> bool` - Check if in terminal state
- `is_approved() -> bool` - Check if approved
- `is_denied() -> bool` - Check if denied
- `to_request() -> ApprovalRequest` - Get approval request for gateway submission
- `to_record(approver_wallet: Optional[str] = None, approver_role: Optional[str] = None) -> ApprovalRecord` - Get approval record

### `can_transition(current_state: str, trigger: str) -> bool`

Check if a state transition is valid without performing it.

### `valid_triggers(state: str) -> List[str]`

Get all valid triggers from a given state.

## Policy Constraints

The SDK supports these constraint types:

- **Enumeration**: Array of permitted values (with domain matching for `@domain` patterns)
- **Numeric max**: Field names starting with `max_`
- **Numeric min**: Field names starting with `min_`
- **Pattern**: Field names containing "pattern" (regex matching)
- **Boolean**: False is most restrictive
- **Deny list**: Field names containing "prohibited" (checked before enumeration)
- **Rate limit**: Objects with `max` and `per` fields (tracked by gateway, not enforced locally)

## Approval State Machine

The approval state machine has 9 states:

1. `REQUESTED` - Initial state
2. `PENDING_REVIEW` - Awaiting approval decision
3. `APPROVED` - Approved (terminal)
4. `DENIED` - Denied (terminal)
5. `EXPIRED` - Approval expired
6. `ESCALATED` - Escalated to higher authority
7. `DENIED_TIMEOUT` - Escalation exhausted (terminal)
8. `REVOKED` - Approval revoked (terminal)
9. `NONE` - Not applicable

Terminal states: `APPROVED`, `DENIED`, `DENIED_TIMEOUT`, `REVOKED`

Valid transitions:
- `REQUESTED` → `PENDING_REVIEW` (deliver), `REVOKED` (revoke)
- `PENDING_REVIEW` → `APPROVED` (approve), `DENIED` (deny), `EXPIRED` (timeout), `REVOKED` (revoke)
- `EXPIRED` → `ESCALATED` (escalate), `DENIED_TIMEOUT` (exhaust_escalation), `REVOKED` (revoke)
- `ESCALATED` → `PENDING_REVIEW` (deliver), `REVOKED` (revoke)

## Testing

Run the test suite:

```bash
pip install -e ".[test]"
pytest
```

## Type Hints

All modules are fully typed. Use with your IDE for excellent autocomplete and type checking:

```python
from atp_protocol import ApprovalFlow, ApprovalState

flow: ApprovalFlow = ApprovalFlow(...)
state: ApprovalState = flow.transition("deliver")
```

## Standards Compliance

This SDK implements the [ATP Specification v1.0.0-draft.2](https://atp-protocol.org/spec).

## License

MIT
