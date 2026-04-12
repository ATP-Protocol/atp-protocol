"""
ATP Contract Validation

Validates ATP execution contracts against the spec (Section 4).
This module provides local validation without requiring a gateway connection.
"""

import re
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, List, Optional

from .types import ATPContract, AttestationLevel, IdempotencyModel, CredentialInjectionMethod


@dataclass
class ValidationError:
    """A validation error in the contract."""
    field: str
    message: str
    code: str


@dataclass
class ValidationWarning:
    """A validation warning in the contract."""
    field: str
    message: str
    code: str


@dataclass
class ValidationResult:
    """Result of contract validation."""
    valid: bool
    errors: List[ValidationError]
    warnings: List[ValidationWarning]


# Validation patterns
SEMVER_PATTERN = re.compile(r"^\d+\.\d+\.\d+$")
AUTHORITY_PATTERN = re.compile(r"^org\..+\..+$")
ISO_DURATION_PATTERN = re.compile(r"^P")

VALID_ATTESTATION_LEVELS = {"full", "light", "none"}
VALID_IDEMPOTENCY_MODELS = {"gateway-enforced", "tool-native", "unsafe"}
VALID_INJECTION_METHODS = {"oauth_token", "api_key", "bearer_token", "basic_auth", "custom"}


def validate_contract(contract: Any) -> ValidationResult:
    """
    Validate an ATP execution contract.

    Checks required fields, field formats, and cross-field consistency.
    Returns errors (invalid contract) and warnings (valid but potentially problematic).

    Args:
        contract: The contract object to validate.

    Returns:
        ValidationResult with valid flag, errors list, and warnings list.

    Example:
        >>> result = validate_contract(my_contract)
        >>> if not result.valid:
        ...     print("Contract invalid:", result.errors)
    """
    errors: List[ValidationError] = []
    warnings: List[ValidationWarning] = []

    if not isinstance(contract, dict):
        errors.append(ValidationError(
            field="(root)",
            message="Contract must be a non-null object",
            code="INVALID_TYPE",
        ))
        return ValidationResult(valid=False, errors=errors, warnings=warnings)

    # Required fields
    _validate_required(contract, "version", errors)
    _validate_required(contract, "authority", errors)
    _validate_required(contract, "actions", errors)
    _validate_required(contract, "attestation", errors)

    # Version format
    if isinstance(contract.get("version"), str):
        if not SEMVER_PATTERN.match(contract["version"]):
            errors.append(ValidationError(
                field="version",
                message=f'Version must be semver format (got "{contract["version"]}")',
                code="INVALID_VERSION",
            ))

    # Authority format
    if isinstance(contract.get("authority"), str):
        if not AUTHORITY_PATTERN.match(contract["authority"]):
            errors.append(ValidationError(
                field="authority",
                message=f'Authority must match org.{{domain}}.{{permission}} format (got "{contract["authority"]}")',
                code="INVALID_AUTHORITY",
            ))

    # Actions array
    if "actions" in contract:
        actions = contract["actions"]
        if isinstance(actions, list):
            if len(actions) == 0:
                errors.append(ValidationError(
                    field="actions",
                    message="Actions array must have at least one item",
                    code="EMPTY_ACTIONS",
                ))
            for i, action in enumerate(actions):
                if not isinstance(action, str):
                    errors.append(ValidationError(
                        field=f"actions[{i}]",
                        message="Each action must be a string",
                        code="INVALID_ACTION_TYPE",
                    ))
        else:
            errors.append(ValidationError(
                field="actions",
                message="Actions must be an array",
                code="INVALID_ACTIONS_TYPE",
            ))

    # Attestation
    if isinstance(contract.get("attestation"), str):
        attestation = contract["attestation"]
        if attestation not in VALID_ATTESTATION_LEVELS:
            errors.append(ValidationError(
                field="attestation",
                message=f"Attestation must be one of: {', '.join(sorted(VALID_ATTESTATION_LEVELS))}",
                code="INVALID_ATTESTATION",
            ))
        if attestation == "none":
            warnings.append(ValidationWarning(
                field="attestation",
                message="Attestation 'none' is only permitted in development. Production contracts MUST use 'full' or 'light'.",
                code="DEV_ONLY_ATTESTATION",
            ))

    # Idempotency
    if "idempotency" in contract:
        idempotency = contract["idempotency"]
        if idempotency not in VALID_IDEMPOTENCY_MODELS:
            errors.append(ValidationError(
                field="idempotency",
                message=f"Idempotency must be one of: {', '.join(sorted(VALID_IDEMPOTENCY_MODELS))}",
                code="INVALID_IDEMPOTENCY",
            ))
        if idempotency == "unsafe":
            scope = contract.get("scope", {})
            if not isinstance(scope, dict) or not scope.get("idempotency_ack"):
                errors.append(ValidationError(
                    field="idempotency",
                    message="Contracts with idempotency 'unsafe' require scope.idempotency_ack = true",
                    code="MISSING_IDEMPOTENCY_ACK",
                ))
            warnings.append(ValidationWarning(
                field="idempotency",
                message="Idempotency 'unsafe' means retries may cause duplicate side effects.",
                code="UNSAFE_IDEMPOTENCY",
            ))

    # Approval config
    if "approval" in contract:
        approval = contract["approval"]
        if isinstance(approval, dict):
            if "timeout" in approval:
                timeout = approval["timeout"]
                if not isinstance(timeout, str) or not ISO_DURATION_PATTERN.match(timeout):
                    errors.append(ValidationError(
                        field="approval.timeout",
                        message="Approval timeout must be an ISO 8601 duration (starting with P)",
                        code="INVALID_APPROVAL_TIMEOUT",
                    ))
            if approval.get("required") is True and not approval.get("approver_role"):
                warnings.append(ValidationWarning(
                    field="approval.approver_role",
                    message="Approval is required but no approver_role is specified. The gateway must have a default.",
                    code="MISSING_APPROVER_ROLE",
                ))

    # Credentials config
    if "credentials" in contract:
        credentials = contract["credentials"]
        if isinstance(credentials, dict):
            if "inject_as" in credentials:
                inject_as = credentials["inject_as"]
                if inject_as not in VALID_INJECTION_METHODS:
                    errors.append(ValidationError(
                        field="credentials.inject_as",
                        message=f"inject_as must be one of: {', '.join(sorted(VALID_INJECTION_METHODS))}",
                        code="INVALID_INJECTION_METHOD",
                    ))
            if credentials.get("fail_closed") is False:
                warnings.append(ValidationWarning(
                    field="credentials.fail_closed",
                    message="fail_closed is false. This is only permitted in development. Production contracts MUST use fail_closed: true.",
                    code="DEV_ONLY_FAIL_OPEN",
                ))

    # Expiry
    if "expiry" in contract:
        expiry = contract["expiry"]
        if isinstance(expiry, str):
            try:
                expiry_date = datetime.fromisoformat(expiry.replace("Z", "+00:00"))
                if expiry_date.timestamp() < datetime.now(expiry_date.tzinfo).timestamp():
                    warnings.append(ValidationWarning(
                        field="expiry",
                        message="Contract expiry is in the past",
                        code="EXPIRED_CONTRACT",
                    ))
            except (ValueError, TypeError):
                errors.append(ValidationError(
                    field="expiry",
                    message="Expiry must be a valid ISO 8601 datetime",
                    code="INVALID_EXPIRY",
                ))

    # Execution timeout
    if "execution_timeout" in contract:
        execution_timeout = contract["execution_timeout"]
        if not isinstance(execution_timeout, str) or not ISO_DURATION_PATTERN.match(execution_timeout):
            errors.append(ValidationError(
                field="execution_timeout",
                message="Execution timeout must be an ISO 8601 duration",
                code="INVALID_EXECUTION_TIMEOUT",
            ))

    # Delegation
    if "delegation" in contract:
        delegation = contract["delegation"]
        if isinstance(delegation, dict):
            if "max_depth" in delegation:
                max_depth = delegation["max_depth"]
                if not isinstance(max_depth, int) or max_depth < 0 or max_depth > 5:
                    errors.append(ValidationError(
                        field="delegation.max_depth",
                        message="Delegation max_depth must be 0-5",
                        code="INVALID_DELEGATION_DEPTH",
                    ))

    return ValidationResult(valid=len(errors) == 0, errors=errors, warnings=warnings)


def is_contract_expired(contract: ATPContract) -> bool:
    """
    Check if a contract is expired.

    Args:
        contract: The contract to check.

    Returns:
        True if the contract's expiry date is in the past, False otherwise.
    """
    if "expiry" not in contract:
        return False
    expiry_str = contract.get("expiry")
    if not isinstance(expiry_str, str):
        return False
    try:
        expiry_date = datetime.fromisoformat(expiry_str.replace("Z", "+00:00"))
        return expiry_date.timestamp() < datetime.now(expiry_date.tzinfo).timestamp()
    except (ValueError, TypeError):
        return False


def requires_approval(contract: ATPContract, amount: Optional[float] = None) -> bool:
    """
    Check if a contract requires approval for a given amount.

    Args:
        contract: The contract to check.
        amount: Optional amount to check against required_above threshold.

    Returns:
        True if approval is required, False otherwise.
    """
    approval = contract.get("approval")
    if not isinstance(approval, dict) or not approval.get("required"):
        return False

    required_above = approval.get("required_above")
    if required_above is None:
        return True  # Always required

    if amount is None:
        return False

    return amount > required_above


def parse_escalation_path(contract: ATPContract) -> List[str]:
    """
    Parse the escalation path into an ordered list of roles.

    Args:
        contract: The contract to parse.

    Returns:
        List of role names in escalation order.
    """
    approval = contract.get("approval")
    if not isinstance(approval, dict):
        return []

    escalation_path = approval.get("escalation_path")
    if not isinstance(escalation_path, str):
        return []

    return [r.strip() for r in escalation_path.split(",") if r.strip()]


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _validate_required(obj: Dict[str, Any], field: str, errors: List[ValidationError]) -> None:
    """Check if a required field is present."""
    if field not in obj or obj[field] is None:
        errors.append(ValidationError(
            field=field,
            message=f'Required field "{field}" is missing',
            code="MISSING_REQUIRED",
        ))
