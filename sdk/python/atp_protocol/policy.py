"""
ATP Policy Evaluation

Local policy evaluation engine for ATP contracts (Spec Section 6).
Evaluates scope constraints against request parameters.
"""

import re
from datetime import datetime
from typing import Any, Dict, List, Optional

from .types import ATPContract, PolicyEvaluation, PolicyConstraint, PolicySource


def evaluate_policy(
    contract: ATPContract,
    request_params: Dict[str, Any],
) -> PolicyEvaluation:
    """
    Evaluate request parameters against a contract's scope constraints.

    This performs local policy evaluation (contract-level only).
    Full policy evaluation with organization and template policies
    requires a gateway connection.

    Args:
        contract: The ATP contract with scope constraints.
        request_params: The request parameters to evaluate.

    Returns:
        PolicyEvaluation with permitted flag and applied constraints.

    Example:
        >>> result = evaluate_policy(contract, {
        ...     "recipient": "user@approved-vendors.com",
        ...     "amount": 2500
        ... })
        >>> if not result.permitted:
        ...     print("Policy violation:", result.denial_reason)
    """
    constraints: List[PolicyConstraint] = []
    now = datetime.utcnow().isoformat() + "Z"

    scope = contract.get("scope")
    if not isinstance(scope, dict) or not scope:
        return PolicyEvaluation(
            permitted=True,
            policies_evaluated=0,
            constraints_applied=[],
            evaluated_at=now,
        )

    policies_evaluated = 0

    for field, constraint in scope.items():
        # Skip metadata fields
        if field == "idempotency_ack":
            continue

        policies_evaluated += 1
        request_value = request_params.get(field)

        # Deny list (field name contains "prohibited") — must check BEFORE enumeration
        if "prohibited" in field and isinstance(constraint, list):
            constraints.append(PolicyConstraint(source="contract", field=field, value=constraint))

            if request_value is not None and isinstance(request_value, str):
                lower = request_value.lower()
                for denied in constraint:
                    if isinstance(denied, str) and denied.lower() in lower:
                        return PolicyEvaluation(
                            permitted=False,
                            policies_evaluated=policies_evaluated,
                            constraints_applied=constraints,
                            evaluated_at=now,
                            denial_reason=f'Content contains prohibited term: "{denied}"',
                            denial_source="contract",
                        )
            continue

        # Enumeration constraint (array of permitted values)
        if isinstance(constraint, list):
            constraints.append(PolicyConstraint(source="contract", field=field, value=constraint))

            if request_value is not None:
                if not _check_enumeration(constraint, request_value):
                    return PolicyEvaluation(
                        permitted=False,
                        policies_evaluated=policies_evaluated,
                        constraints_applied=constraints,
                        evaluated_at=now,
                        denial_reason=f'Value for "{field}" is not in the permitted set',
                        denial_source="contract",
                    )
            continue

        # Numeric max constraint
        if field.startswith("max_") and isinstance(constraint, (int, float)):
            constraints.append(PolicyConstraint(source="contract", field=field, value=constraint))

            if request_value is not None and isinstance(request_value, (int, float)):
                if request_value > constraint:
                    return PolicyEvaluation(
                        permitted=False,
                        policies_evaluated=policies_evaluated,
                        constraints_applied=constraints,
                        evaluated_at=now,
                        denial_reason=f'Value for "{field}" ({request_value}) exceeds maximum ({constraint})',
                        denial_source="contract",
                    )
            continue

        # Numeric min constraint
        if field.startswith("min_") and isinstance(constraint, (int, float)):
            constraints.append(PolicyConstraint(source="contract", field=field, value=constraint))

            if request_value is not None and isinstance(request_value, (int, float)):
                if request_value < constraint:
                    return PolicyEvaluation(
                        permitted=False,
                        policies_evaluated=policies_evaluated,
                        constraints_applied=constraints,
                        evaluated_at=now,
                        denial_reason=f'Value for "{field}" ({request_value}) is below minimum ({constraint})',
                        denial_source="contract",
                    )
            continue

        # Boolean constraint
        if isinstance(constraint, bool):
            constraints.append(PolicyConstraint(source="contract", field=field, value=constraint))

            if constraint is False and request_value:
                return PolicyEvaluation(
                    permitted=False,
                    policies_evaluated=policies_evaluated,
                    constraints_applied=constraints,
                    evaluated_at=now,
                    denial_reason=f'"{field}" is not allowed by policy',
                    denial_source="contract",
                )
            continue

        # Pattern constraint (field name contains "pattern")
        if "pattern" in field and isinstance(constraint, str):
            constraints.append(PolicyConstraint(source="contract", field=field, value=constraint))

            if request_value is not None and isinstance(request_value, str):
                try:
                    regex = re.compile(constraint)
                    if not regex.search(request_value):
                        return PolicyEvaluation(
                            permitted=False,
                            policies_evaluated=policies_evaluated,
                            constraints_applied=constraints,
                            evaluated_at=now,
                            denial_reason=f'Value for "{field}" does not match required pattern',
                            denial_source="contract",
                        )
                except re.error:
                    return PolicyEvaluation(
                        permitted=False,
                        policies_evaluated=policies_evaluated,
                        constraints_applied=constraints,
                        evaluated_at=now,
                        denial_reason=f'Invalid pattern constraint for "{field}"',
                        denial_source="contract",
                    )
            continue

        # Rate limit constraint (object with max and per)
        if isinstance(constraint, dict) and "max" in constraint and "per" in constraint:
            constraints.append(PolicyConstraint(source="contract", field=field, value=constraint))
            # Rate limit enforcement requires state — tracked by gateway, not local eval
            continue

        # Generic constraint — record but don't enforce locally
        constraints.append(PolicyConstraint(source="contract", field=field, value=constraint))

    return PolicyEvaluation(
        permitted=True,
        policies_evaluated=policies_evaluated,
        constraints_applied=constraints,
        evaluated_at=now,
    )


def merge_constraints(
    *policy_sets: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Merge multiple policy constraint sets, applying the most restrictive rule.
    Used when combining organization, template, and contract policies.

    Args:
        *policy_sets: Variable number of policy dictionaries to merge.

    Returns:
        Merged constraint dictionary with most restrictive rules applied.

    Example:
        >>> merged = merge_constraints(org_policies, contract_policies)
    """
    merged: Dict[str, Any] = {}

    for policies in policy_sets:
        for field, value in policies.items():
            if field not in merged:
                merged[field] = value
                continue

            existing = merged[field]

            # Enumerations: intersection
            if isinstance(existing, list) and isinstance(value, list):
                merged[field] = [v for v in existing if v in value]
                continue

            # Numeric max: take lowest
            if field.startswith("max_") and isinstance(existing, (int, float)) and isinstance(value, (int, float)):
                merged[field] = min(existing, value)
                continue

            # Numeric min: take highest
            if field.startswith("min_") and isinstance(existing, (int, float)) and isinstance(value, (int, float)):
                merged[field] = max(existing, value)
                continue

            # Boolean: false wins
            if isinstance(existing, bool) and isinstance(value, bool):
                merged[field] = existing and value
                continue

            # Rate limit: lowest rate
            if _is_rate_limit(existing) and _is_rate_limit(value):
                existing_max = existing.get("max", float("inf"))
                value_max = value.get("max", float("inf"))
                merged[field] = existing if existing_max <= value_max else value
                continue

            # Default: later policy wins (higher priority)
            merged[field] = value

    return merged


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _check_enumeration(permitted: List[Any], value: Any) -> bool:
    """
    Check if a value matches the enumeration constraint.
    Supports domain matching (e.g., "@approved-vendors.com" matches "user@approved-vendors.com").
    """
    if isinstance(value, str):
        for p in permitted:
            if isinstance(p, str) and p.startswith("@"):
                if value.endswith(p):
                    return True
            elif p == value:
                return True
        return False
    return value in permitted


def _is_rate_limit(value: Any) -> bool:
    """Check if a constraint is a rate limit object."""
    return (
        isinstance(value, dict)
        and "max" in value
        and "per" in value
    )
