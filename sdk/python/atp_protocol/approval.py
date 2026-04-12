"""
ATP Approval State Machine

Implements the approval state machine from spec Section 7.
9 states, deterministic transitions, cryptographic binding.
"""

import hashlib
import json
import secrets
import string
from datetime import datetime
from typing import Any, Dict, List, Optional, Set

from .types import (
    ApprovalState,
    ApprovalTrigger,
    ApprovalRecord,
    ApprovalRequest,
    ApprovalTransition,
    TERMINAL_APPROVAL_STATES,
)


class ApprovalError(Exception):
    """Error during approval state transitions."""

    def __init__(self, message: str, state: ApprovalState, trigger: ApprovalTrigger):
        super().__init__(message)
        self.state = state
        self.trigger = trigger


class ApprovalFlow:
    """
    Manages the approval lifecycle for a single execution request.

    Implements the 9-state approval state machine from ATP Spec Section 7.
    Valid states: NONE, REQUESTED, PENDING_REVIEW, APPROVED, DENIED, EXPIRED,
    ESCALATED, DENIED_TIMEOUT, REVOKED.

    Example:
        >>> flow = ApprovalFlow("ctr_123", "send-email", {"recipient": "a@b.com"}, "0xWallet")
        >>> flow.transition("deliver")  # REQUESTED → PENDING_REVIEW
        >>> flow.transition("approve")  # PENDING_REVIEW → APPROVED
        >>> if flow.is_approved():
        ...     print("Proceed to execution")
    """

    # Valid transitions: state -> {trigger -> next_state}
    _VALID_TRANSITIONS: Dict[ApprovalState, Dict[ApprovalTrigger, ApprovalState]] = {
        "REQUESTED": {
            "deliver": "PENDING_REVIEW",
            "revoke": "REVOKED",
        },
        "PENDING_REVIEW": {
            "approve": "APPROVED",
            "deny": "DENIED",
            "timeout": "EXPIRED",
            "revoke": "REVOKED",
        },
        "EXPIRED": {
            "escalate": "ESCALATED",
            "exhaust_escalation": "DENIED_TIMEOUT",
            "revoke": "REVOKED",
        },
        "ESCALATED": {
            "deliver": "PENDING_REVIEW",
            "revoke": "REVOKED",
        },
    }

    def __init__(
        self,
        contract_id: str,
        action: str,
        scope_params: Dict[str, Any],
        requesting_wallet: str,
        nonce: Optional[str] = None,
    ):
        """
        Initialize an approval flow.

        Args:
            contract_id: The contract ID.
            action: The action being approved.
            scope_params: Scope parameters for this request.
            requesting_wallet: The wallet requesting the action.
            nonce: Optional nonce; generated if not provided.
        """
        self.contract_id = contract_id
        self.action = action
        self.scope_params = scope_params
        self.requesting_wallet = requesting_wallet
        self.nonce = nonce or _generate_nonce()
        self.created_at = datetime.utcnow().isoformat() + "Z"

        self._state: ApprovalState = "REQUESTED"
        self._history: List[ApprovalTransition] = []
        self._escalation_depth = 0

        # Record initial REQUESTED state
        self._history.append(
            ApprovalTransition(
                from_state="REQUESTED",
                to_state="REQUESTED",
                trigger="submit",
                timestamp=self.created_at,
            )
        )

    @property
    def state(self) -> ApprovalState:
        """Get the current state."""
        return self._state

    @property
    def history(self) -> List[ApprovalTransition]:
        """Get the transition history."""
        return list(self._history)

    @property
    def escalation_depth(self) -> int:
        """Get the escalation depth."""
        return self._escalation_depth

    def transition(
        self,
        trigger: ApprovalTrigger,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> ApprovalState:
        """
        Attempt a state transition.

        Args:
            trigger: The trigger to apply.
            metadata: Optional metadata for the transition.

        Returns:
            The new state.

        Raises:
            ApprovalError: If the transition is invalid.
        """
        if self.is_terminal():
            raise ApprovalError(
                f'Cannot transition from terminal state "{self._state}"',
                self._state,
                trigger,
            )

        valid_transitions = self._VALID_TRANSITIONS.get(self._state)
        if not valid_transitions:
            raise ApprovalError(
                f'No transitions defined for state "{self._state}"',
                self._state,
                trigger,
            )

        next_state = valid_transitions.get(trigger)
        if next_state is None:
            raise ApprovalError(
                f'Invalid transition: "{self._state}" → "{trigger}"',
                self._state,
                trigger,
            )

        transition = ApprovalTransition(
            from_state=self._state,
            to_state=next_state,
            trigger=trigger,
            timestamp=datetime.utcnow().isoformat() + "Z",
            metadata=metadata,
        )

        self._state = next_state
        self._history.append(transition)

        if trigger == "escalate":
            self._escalation_depth += 1

        return next_state

    def is_terminal(self) -> bool:
        """Check if the current state is terminal."""
        return self._state in TERMINAL_APPROVAL_STATES

    def is_approved(self) -> bool:
        """Check if the approval was granted."""
        return self._state == "APPROVED"

    def is_denied(self) -> bool:
        """Check if the approval was denied (any denial reason)."""
        return self._state in {"DENIED", "DENIED_TIMEOUT", "REVOKED"}

    def to_request(self) -> ApprovalRequest:
        """
        Get the approval request object for submission to a gateway.

        Returns:
            ApprovalRequest ready for gateway submission.
        """
        return ApprovalRequest(
            contract_id=self.contract_id,
            action=self.action,
            scope_params=self.scope_params,
            requesting_wallet=self.requesting_wallet,
            nonce=self.nonce,
        )

    def to_record(
        self,
        approver_wallet: Optional[str] = None,
        approver_role: Optional[str] = None,
    ) -> ApprovalRecord:
        """
        Build an approval record from the current state.

        Args:
            approver_wallet: Optional wallet of the approver.
            approver_role: Optional role of the approver.

        Returns:
            ApprovalRecord representing this approval.
        """
        if self.is_approved():
            decision = "approved"
        elif self._state == "DENIED":
            decision = "denied"
        elif self._state in {"EXPIRED", "DENIED_TIMEOUT"}:
            decision = "expired"
        elif self._state == "REVOKED":
            decision = "revoked"
        else:
            decision = "expired"

        decided_at = None
        if self.is_terminal():
            decided_at = self._history[-1].timestamp

        return ApprovalRecord(
            approval_id=f"apr_{self.nonce}",
            contract_id=self.contract_id,
            action=self.action,
            scope_hash=_compute_scope_hash(self.scope_params),
            requesting_wallet=self.requesting_wallet,
            approver_wallet=approver_wallet,
            approver_role=approver_role or "unknown",
            decision=decision,
            decided_at=decided_at,
            nonce=self.nonce,
            escalation_depth=self._escalation_depth,
        )


def can_transition(current_state: ApprovalState, trigger: ApprovalTrigger) -> bool:
    """
    Check if a transition is valid without performing it.

    Args:
        current_state: The current approval state.
        trigger: The trigger to attempt.

    Returns:
        True if the transition is valid, False otherwise.
    """
    if current_state in TERMINAL_APPROVAL_STATES:
        return False
    valid_transitions = ApprovalFlow._VALID_TRANSITIONS.get(current_state)
    if not valid_transitions:
        return False
    return trigger in valid_transitions


def valid_triggers(state: ApprovalState) -> List[ApprovalTrigger]:
    """
    Get all valid triggers for a given state.

    Args:
        state: The approval state.

    Returns:
        List of valid triggers from this state.
    """
    if state in TERMINAL_APPROVAL_STATES:
        return []
    valid_transitions = ApprovalFlow._VALID_TRANSITIONS.get(state)
    if not valid_transitions:
        return []
    return list(valid_transitions.keys())


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _generate_nonce() -> str:
    """Generate a random nonce."""
    chars = string.ascii_lowercase + string.digits
    random_part = "".join(secrets.choice(chars) for _ in range(12))
    return f"n_{random_part}"


def _compute_scope_hash(scope: Dict[str, Any]) -> str:
    """
    Compute a scope hash for cryptographic binding.

    Args:
        scope: The scope parameters.

    Returns:
        SHA256 hash of the canonical scope JSON.
    """
    # Deterministic JSON serialization: sort keys
    canonical = json.dumps(scope, sort_keys=True, separators=(",", ":"))
    hash_digest = hashlib.sha256(canonical.encode()).hexdigest()
    return f"sha256:{hash_digest}"
