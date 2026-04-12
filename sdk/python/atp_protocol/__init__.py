"""
ATP Protocol SDK for Python

A comprehensive SDK for the Agent Trust Protocol (ATP), providing:
- Contract validation
- Policy evaluation
- Approval state machine
- Type definitions

Example usage:
    >>> from atp_protocol import validate_contract, evaluate_policy, ApprovalFlow
    >>>
    >>> # Validate a contract
    >>> result = validate_contract(my_contract)
    >>> if result.valid:
    ...     print("Contract is valid")
    >>>
    >>> # Evaluate policies
    >>> policy_result = evaluate_policy(my_contract, {"amount": 1000})
    >>> if policy_result.permitted:
    ...     print("Request permitted by policy")
    >>>
    >>> # Manage approvals
    >>> flow = ApprovalFlow("ctr_123", "send-email", {}, "0xWallet")
    >>> flow.transition("deliver")
    >>> flow.transition("approve")
"""

from .approval import (
    ApprovalError,
    ApprovalFlow,
    can_transition,
    valid_triggers,
)
from .contract import (
    ValidationError,
    ValidationResult,
    ValidationWarning,
    is_contract_expired,
    parse_escalation_path,
    requires_approval,
    validate_contract,
)
from .policy import (
    evaluate_policy,
    merge_constraints,
)
from .types import (
    ApprovalConfig,
    ApprovalDecision,
    ApprovalRecord,
    ApprovalRequest,
    ApprovalState,
    ApprovalTransition,
    ApprovalTrigger,
    ATPContract,
    AttestationLevel,
    AuthorityDenialReason,
    AuthorityVerification,
    ConstraintRuleType,
    CredentialConfig,
    CredentialInjectionMethod,
    DelegationConfig,
    DenialContext,
    DenialStage,
    EvidenceRecord,
    EvidenceStatus,
    EvidenceTimestamps,
    ExecutionOutcome,
    ExecutionRecord,
    GatewayConfig,
    GatewayMetadata,
    GovernOptions,
    GovernedResult,
    IdempotencyModel,
    OutputConfig,
    PolicyConstraint,
    PolicyEvaluation,
    PolicyRule,
    PolicySource,
    TERMINAL_APPROVAL_STATES,
)

__version__ = "1.0.0-draft.2"
__all__ = [
    # Approval module
    "ApprovalError",
    "ApprovalFlow",
    "can_transition",
    "valid_triggers",
    # Contract module
    "ValidationError",
    "ValidationResult",
    "ValidationWarning",
    "is_contract_expired",
    "parse_escalation_path",
    "requires_approval",
    "validate_contract",
    # Policy module
    "evaluate_policy",
    "merge_constraints",
    # Types
    "ApprovalConfig",
    "ApprovalDecision",
    "ApprovalRecord",
    "ApprovalRequest",
    "ApprovalState",
    "ApprovalTransition",
    "ApprovalTrigger",
    "ATPContract",
    "AttestationLevel",
    "AuthorityDenialReason",
    "AuthorityVerification",
    "ConstraintRuleType",
    "CredentialConfig",
    "CredentialInjectionMethod",
    "DelegationConfig",
    "DenialContext",
    "DenialStage",
    "EvidenceRecord",
    "EvidenceStatus",
    "EvidenceTimestamps",
    "ExecutionOutcome",
    "ExecutionRecord",
    "GatewayConfig",
    "GatewayMetadata",
    "GovernOptions",
    "GovernedResult",
    "IdempotencyModel",
    "OutputConfig",
    "PolicyConstraint",
    "PolicyEvaluation",
    "PolicyRule",
    "PolicySource",
    "TERMINAL_APPROVAL_STATES",
]
