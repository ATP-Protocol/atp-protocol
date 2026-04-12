"""
ATP SDK Core Types

Type definitions for the Agent Trust Protocol.
These types map directly to the ATP specification (v1.0.0-draft.2).
"""

from dataclasses import dataclass, field
from typing import Any, Literal, Optional, TypedDict, Dict, List, Set
from datetime import datetime


# ---------------------------------------------------------------------------
# Literal Types
# ---------------------------------------------------------------------------

AttestationLevel = Literal["full", "light", "none"]
IdempotencyModel = Literal["gateway-enforced", "tool-native", "unsafe"]
CredentialInjectionMethod = Literal["oauth_token", "api_key", "bearer_token", "basic_auth", "custom"]
PolicySource = Literal["organization", "template", "contract", "runtime"]
ApprovalState = Literal["NONE", "REQUESTED", "PENDING_REVIEW", "APPROVED", "DENIED", "EXPIRED", "ESCALATED", "DENIED_TIMEOUT", "REVOKED"]
ApprovalTrigger = Literal["submit", "deliver", "approve", "deny", "timeout", "escalate", "exhaust_escalation", "revoke"]
ExecutionOutcome = Literal["outcome:success", "outcome:failure", "outcome:denied", "outcome:timeout", "outcome:partial", "outcome:unknown"]
ApprovalDecision = Literal["approved", "denied", "expired", "revoked", "superseded"]
EvidenceStatus = Literal["confirmed", "pending", "failed"]
AuthorityDenialReason = Literal["wallet_not_bound", "role_missing_authority", "policy_override_deny", "contract_expired", "contract_revoked", "federation_not_established"]
ConformanceLevel = Literal["aware", "compatible", "verified", "attested"]
DenialStage = Literal["authority", "policy", "approval", "credential", "execution"]
ConstraintRuleType = Literal["enumeration", "numeric_max", "numeric_min", "pattern", "temporal", "boolean", "deny_list", "rate_limit", "size_limit"]

TERMINAL_APPROVAL_STATES: Set[ApprovalState] = {"APPROVED", "DENIED", "DENIED_TIMEOUT", "REVOKED"}


# ---------------------------------------------------------------------------
# Contract TypedDicts
# ---------------------------------------------------------------------------

class ApprovalConfig(TypedDict, total=False):
    required: bool
    required_above: Optional[float]
    approver_role: str
    timeout: str
    escalation_path: str


class CredentialConfig(TypedDict, total=False):
    provider: str
    scope: List[str]
    inject_as: CredentialInjectionMethod
    fail_closed: bool


class OutputConfig(TypedDict, total=False):
    object_type: str
    initial_state: str
    schema_ref: str


class DelegationConfig(TypedDict, total=False):
    allow_sub_delegation: bool
    max_depth: int


class ATPContract(TypedDict, total=False):
    version: str
    authority: str
    template: str
    actions: List[str]
    scope: Dict[str, Any]
    approval: ApprovalConfig
    credentials: CredentialConfig
    output: OutputConfig
    attestation: AttestationLevel
    revocable: bool
    expiry: str
    idempotency: IdempotencyModel
    execution_timeout: str
    delegation: DelegationConfig


# ---------------------------------------------------------------------------
# Authority Types
# ---------------------------------------------------------------------------

@dataclass
class AuthorityVerification:
    authorized: bool
    authority: str
    wallet: str
    org_id: str
    role: str
    constraints_applied: List[str]
    resolved_at: str
    denial_reason: Optional[AuthorityDenialReason] = None


# ---------------------------------------------------------------------------
# Policy Types
# ---------------------------------------------------------------------------

@dataclass
class PolicyConstraint:
    source: PolicySource
    field: str
    value: Any


@dataclass
class PolicyEvaluation:
    permitted: bool
    policies_evaluated: int
    constraints_applied: List[PolicyConstraint]
    evaluated_at: str
    denial_reason: Optional[str] = None
    denial_source: Optional[PolicySource] = None


@dataclass
class PolicyRule:
    source: PolicySource
    field: str
    type: ConstraintRuleType
    value: Any


# ---------------------------------------------------------------------------
# Approval Types
# ---------------------------------------------------------------------------

@dataclass
class ApprovalRecord:
    approval_id: str
    contract_id: str
    action: str
    scope_hash: str
    requesting_wallet: str
    approver_role: str
    decision: ApprovalDecision
    nonce: str
    escalation_depth: int
    approver_wallet: Optional[str] = None
    decided_at: Optional[str] = None


@dataclass
class ApprovalRequest:
    contract_id: str
    action: str
    scope_params: Dict[str, Any]
    requesting_wallet: str
    nonce: str


@dataclass
class ApprovalTransition:
    from_state: ApprovalState
    to_state: ApprovalState
    trigger: ApprovalTrigger
    timestamp: str
    metadata: Optional[Dict[str, Any]] = None


# ---------------------------------------------------------------------------
# Execution Types
# ---------------------------------------------------------------------------

@dataclass
class ExecutionRecord:
    execution_id: str
    contract_id: str
    action: str
    outcome: ExecutionOutcome
    request_hash: str
    idempotency_key: str
    gateway_id: str
    started_at: str
    response_summary: Optional[Dict[str, Any]] = None
    credential_provider: Optional[str] = None
    credential_scope_used: Optional[List[str]] = None
    approval_id: Optional[str] = None
    completed_at: Optional[str] = None


# ---------------------------------------------------------------------------
# Evidence Types
# ---------------------------------------------------------------------------

@dataclass
class EvidenceTimestamps:
    requested_at: str
    evidenced_at: str
    authorized_at: Optional[str] = None
    approved_at: Optional[str] = None
    executed_at: Optional[str] = None


@dataclass
class EvidenceRecord:
    evidence_id: str
    execution_id: str
    contract_id: str
    authority: str
    requesting_wallet: str
    requesting_org: str
    action: str
    scope_snapshot: Dict[str, Any]
    outcome: ExecutionOutcome
    request_hash: str
    gateway_id: str
    attestation_level: AttestationLevel
    timestamps: EvidenceTimestamps
    credential_path: Dict[str, Any]
    policy_snapshot: Dict[str, Any]
    approval: Optional[ApprovalRecord] = None
    response_hash: Optional[str] = None
    attestation_ref: Optional[str] = None
    evidence_status: Optional[EvidenceStatus] = None


# ---------------------------------------------------------------------------
# Gateway Types
# ---------------------------------------------------------------------------

class GatewayConfig(TypedDict, total=False):
    url: str
    wallet: str
    timeout: int
    retries: int


@dataclass
class GatewayMetadata:
    gateway_id: str
    atp_version: str
    conformance_level: ConformanceLevel
    dual_integration: bool
    conformance_suite_version: Optional[str] = None
    conformance_verified_at: Optional[str] = None


# ---------------------------------------------------------------------------
# Governance Types
# ---------------------------------------------------------------------------

@dataclass
class DenialContext:
    stage: DenialStage
    details: Dict[str, Any]
    contract_id: Optional[str] = None
    action: Optional[str] = None


@dataclass
class GovernedResult:
    outcome: ExecutionOutcome
    execution_id: str
    result: Optional[Any] = None
    evidence_id: Optional[str] = None
    approval_id: Optional[str] = None
    denied_reason: Optional[str] = None
    denied_stage: Optional[DenialStage] = None


class GovernOptions(TypedDict, total=False):
    contract: Any  # str | ATPContract
    gateway: Any  # str | GatewayConfig
    wallet: str
    onApprovalRequired: Any  # Callable
    onEvidenceCaptured: Any  # Callable
    onDenied: Any  # Callable
