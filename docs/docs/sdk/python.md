---
sidebar_position: 3
---

# Python SDK

`atp-protocol` provides Python primitives for contract validation, policy evaluation, and approval state management.

## Install

When published:

```bash
pip install atp-protocol
```

For repo-local development:

```bash
cd sdk/python
pip install -e ".[dev]"
pytest
```

## Validate a contract

```python
from atp_protocol import validate_contract

contract = {
    "version": "1.0.0",
    "authority": "org.finance.approve-payment",
    "actions": ["approve-payment"],
    "attestation": "full",
}

result = validate_contract(contract)

if not result.valid:
    for error in result.errors:
        print(error.field, error.message)
```

## Evaluate policy

```python
from atp_protocol import evaluate_policy

contract = {
    "version": "1.0.0",
    "authority": "org.finance.approve-payment",
    "actions": ["approve-payment"],
    "attestation": "full",
    "scope": {
        "max_amount": 5000,
        "currency": ["USD", "AUD"],
    },
}

decision = evaluate_policy(contract, {
    "max_amount": 3000,
    "currency": "AUD",
})

print(decision.permitted)
```

## Run approval state

```python
from atp_protocol import ApprovalFlow

flow = ApprovalFlow(
    contract_id="ctr_payment_001",
    action="approve-payment",
    scope_params={"amount": 3000, "currency": "AUD"},
    requesting_wallet="0xAgentWallet",
)

flow.transition("deliver")
flow.transition("approve")

if flow.is_approved():
    record = flow.to_record("0xApproverWallet", "finance_controller")
    print(record.approval_id)
```

## Main exports

| Export | Purpose |
|--------|---------|
| `validate_contract` | Validate ATP contract structure |
| `evaluate_policy` | Evaluate request params against contract scope |
| `requires_approval` | Check whether a contract requires approval |
| `parse_escalation_path` | Parse approval escalation roles |
| `ApprovalFlow` | Run approval state transitions |
| `can_transition` | Check transition validity |
| `valid_triggers` | List valid triggers from a state |

## Conformance

The Python SDK is useful for ATP-Aware and ATP-Compatible integrations. Gateway-level ATP-Verified and ATP-Attested claims require evidence capture and external anchoring outside the local SDK.
