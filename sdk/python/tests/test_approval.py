"""
Tests for ATP approval state machine.

Tests the approval flow state machine and transitions.
"""

import pytest
from atp_protocol import (
    ApprovalFlow,
    ApprovalError,
    can_transition,
    valid_triggers,
)


class TestApprovalFlow:
    """Test approval flow state machine."""

    def test_initializes_in_requested_state(self):
        """Should initialize in REQUESTED state."""
        flow = ApprovalFlow(
            contract_id="ctr_123",
            action="send-email",
            scope_params={"recipient": "user@example.com"},
            requesting_wallet="0xWallet",
        )
        assert flow.state == "REQUESTED"
        assert flow.escalation_depth == 0
        assert len(flow.history) == 1

    def test_creates_nonce_if_not_provided(self):
        """Should generate nonce if not provided."""
        flow = ApprovalFlow("ctr_123", "action", {}, "0xWallet")
        assert flow.nonce.startswith("n_")
        assert len(flow.nonce) == 14  # n_ + 12 chars

    def test_uses_provided_nonce(self):
        """Should use provided nonce."""
        flow = ApprovalFlow(
            "ctr_123", "action", {}, "0xWallet",
            nonce="n_custom123456"
        )
        assert flow.nonce == "n_custom123456"

    def test_stores_creation_timestamp(self):
        """Should store creation timestamp."""
        flow = ApprovalFlow("ctr_123", "action", {}, "0xWallet")
        assert flow.created_at is not None
        assert "Z" in flow.created_at  # ISO format with Z

    # Happy path: approve
    def test_happy_path_approval(self):
        """Should allow happy path: REQUESTED -> PENDING_REVIEW -> APPROVED."""
        flow = ApprovalFlow("ctr_123", "send-email", {}, "0xWallet")
        assert flow.state == "REQUESTED"

        new_state = flow.transition("deliver")
        assert new_state == "PENDING_REVIEW"
        assert flow.state == "PENDING_REVIEW"
        assert len(flow.history) == 2

        new_state = flow.transition("approve")
        assert new_state == "APPROVED"
        assert flow.state == "APPROVED"
        assert flow.is_approved() is True
        assert flow.is_denied() is False
        assert flow.is_terminal() is True

    # Happy path: deny
    def test_happy_path_denial(self):
        """Should allow denial path: REQUESTED -> PENDING_REVIEW -> DENIED."""
        flow = ApprovalFlow("ctr_123", "send-email", {}, "0xWallet")
        flow.transition("deliver")
        new_state = flow.transition("deny")
        assert new_state == "DENIED"
        assert flow.is_denied() is True
        assert flow.is_terminal() is True

    # Happy path: timeout/escalation
    def test_happy_path_escalation(self):
        """Should allow escalation: REQUESTED -> PENDING_REVIEW -> EXPIRED -> ESCALATED -> PENDING_REVIEW."""
        flow = ApprovalFlow("ctr_123", "send-email", {}, "0xWallet")
        flow.transition("deliver")
        assert flow.escalation_depth == 0

        flow.transition("timeout")
        assert flow.state == "EXPIRED"

        flow.transition("escalate")
        assert flow.state == "ESCALATED"
        assert flow.escalation_depth == 1

        flow.transition("deliver")
        assert flow.state == "PENDING_REVIEW"
        assert flow.escalation_depth == 1

        flow.transition("approve")
        assert flow.is_approved() is True

    # Happy path: timeout exhaustion
    def test_happy_path_timeout_exhaustion(self):
        """Should allow timeout exhaustion: EXPIRED -> DENIED_TIMEOUT."""
        flow = ApprovalFlow("ctr_123", "send-email", {}, "0xWallet")
        flow.transition("deliver")
        flow.transition("timeout")
        assert flow.state == "EXPIRED"

        flow.transition("exhaust_escalation")
        assert flow.state == "DENIED_TIMEOUT"
        assert flow.is_denied() is True
        assert flow.is_terminal() is True

    # Revocation
    def test_revocation_from_requested(self):
        """Should allow revocation from REQUESTED."""
        flow = ApprovalFlow("ctr_123", "send-email", {}, "0xWallet")
        flow.transition("revoke")
        assert flow.state == "REVOKED"
        assert flow.is_denied() is True

    def test_revocation_from_pending_review(self):
        """Should allow revocation from PENDING_REVIEW."""
        flow = ApprovalFlow("ctr_123", "send-email", {}, "0xWallet")
        flow.transition("deliver")
        flow.transition("revoke")
        assert flow.state == "REVOKED"
        assert flow.is_denied() is True

    def test_revocation_from_expired(self):
        """Should allow revocation from EXPIRED."""
        flow = ApprovalFlow("ctr_123", "send-email", {}, "0xWallet")
        flow.transition("deliver")
        flow.transition("timeout")
        flow.transition("revoke")
        assert flow.state == "REVOKED"

    def test_revocation_from_escalated(self):
        """Should allow revocation from ESCALATED."""
        flow = ApprovalFlow("ctr_123", "send-email", {}, "0xWallet")
        flow.transition("deliver")
        flow.transition("timeout")
        flow.transition("escalate")
        flow.transition("revoke")
        assert flow.state == "REVOKED"

    # Invalid transitions
    def test_rejects_invalid_transition_from_requested(self):
        """Should reject invalid transitions from REQUESTED."""
        flow = ApprovalFlow("ctr_123", "send-email", {}, "0xWallet")
        with pytest.raises(ApprovalError) as exc_info:
            flow.transition("approve")
        assert "Invalid transition" in str(exc_info.value)
        assert exc_info.value.state == "REQUESTED"
        assert exc_info.value.trigger == "approve"

    def test_rejects_invalid_transition_from_pending_review(self):
        """Should reject invalid transitions from PENDING_REVIEW."""
        flow = ApprovalFlow("ctr_123", "send-email", {}, "0xWallet")
        flow.transition("deliver")
        with pytest.raises(ApprovalError) as exc_info:
            flow.transition("deliver")
        assert "Invalid transition" in str(exc_info.value)

    # Terminal state rejection
    def test_rejects_transition_from_approved(self):
        """Should reject any transition from APPROVED."""
        flow = ApprovalFlow("ctr_123", "send-email", {}, "0xWallet")
        flow.transition("deliver")
        flow.transition("approve")
        with pytest.raises(ApprovalError) as exc_info:
            flow.transition("deliver")
        assert "terminal state" in str(exc_info.value)
        assert flow.state == "APPROVED"

    def test_rejects_transition_from_denied(self):
        """Should reject any transition from DENIED."""
        flow = ApprovalFlow("ctr_123", "send-email", {}, "0xWallet")
        flow.transition("deliver")
        flow.transition("deny")
        with pytest.raises(ApprovalError) as exc_info:
            flow.transition("approve")
        assert "terminal state" in str(exc_info.value)
        assert flow.state == "DENIED"

    def test_rejects_transition_from_revoked(self):
        """Should reject any transition from REVOKED."""
        flow = ApprovalFlow("ctr_123", "send-email", {}, "0xWallet")
        flow.transition("revoke")
        with pytest.raises(ApprovalError) as exc_info:
            flow.transition("approve")
        assert "terminal state" in str(exc_info.value)

    # History tracking
    def test_tracks_transition_history(self):
        """Should track transition history."""
        flow = ApprovalFlow("ctr_123", "send-email", {}, "0xWallet")
        flow.transition("deliver")
        flow.transition("approve")

        history = flow.history
        assert len(history) == 3  # Initial REQUESTED + 2 transitions
        assert history[0].trigger == "submit"
        assert history[0].from_state == "REQUESTED"
        assert history[0].to_state == "REQUESTED"
        assert history[1].trigger == "deliver"
        assert history[1].from_state == "REQUESTED"
        assert history[1].to_state == "PENDING_REVIEW"

    def test_tracks_escalation_depth(self):
        """Should increment escalation depth on escalate."""
        flow = ApprovalFlow("ctr_123", "send-email", {}, "0xWallet")
        flow.transition("deliver")
        flow.transition("timeout")
        assert flow.escalation_depth == 0

        flow.transition("escalate")
        assert flow.escalation_depth == 1

        flow.transition("deliver")
        flow.transition("timeout")
        flow.transition("escalate")
        assert flow.escalation_depth == 2

    # to_request
    def test_to_request_returns_approval_request(self):
        """Should generate ApprovalRequest."""
        scope = {"recipient": "user@example.com", "amount": 1000}
        flow = ApprovalFlow(
            "ctr_123", "send-email", scope, "0xWallet",
            nonce="n_test123456"
        )
        request = flow.to_request()

        assert request.contract_id == "ctr_123"
        assert request.action == "send-email"
        assert request.scope_params == scope
        assert request.requesting_wallet == "0xWallet"
        assert request.nonce == "n_test123456"

    # to_record
    def test_to_record_returns_approval_record(self):
        """Should generate ApprovalRecord."""
        flow = ApprovalFlow("ctr_123", "send-email", {"test": "data"}, "0xWallet")
        flow.transition("deliver")
        flow.transition("approve")

        record = flow.to_record(
            approver_wallet="0xApprover",
            approver_role="manager"
        )

        assert record.approval_id.startswith("apr_")
        assert record.contract_id == "ctr_123"
        assert record.action == "send-email"
        assert record.requesting_wallet == "0xWallet"
        assert record.approver_wallet == "0xApprover"
        assert record.approver_role == "manager"
        assert record.decision == "approved"
        assert record.escalation_depth == 0
        assert record.decided_at is not None

    def test_to_record_with_denial(self):
        """Should record denial in record."""
        flow = ApprovalFlow("ctr_123", "send-email", {}, "0xWallet")
        flow.transition("deliver")
        flow.transition("deny")

        record = flow.to_record()
        assert record.decision == "denied"

    def test_to_record_with_expiry(self):
        """Should record expiry in record."""
        flow = ApprovalFlow("ctr_123", "send-email", {}, "0xWallet")
        flow.transition("deliver")
        flow.transition("timeout")

        record = flow.to_record()
        assert record.decision == "expired"

    def test_to_record_with_revocation(self):
        """Should record revocation in record."""
        flow = ApprovalFlow("ctr_123", "send-email", {}, "0xWallet")
        flow.transition("revoke")

        record = flow.to_record()
        assert record.decision == "revoked"

    def test_to_record_computes_scope_hash(self):
        """Should compute scope hash."""
        flow = ApprovalFlow(
            "ctr_123", "send-email",
            {"recipient": "user@example.com", "amount": 1000},
            "0xWallet"
        )
        record = flow.to_record()

        assert record.scope_hash.startswith("sha256:")
        assert len(record.scope_hash) > 10


class TestCanTransition:
    """Test can_transition function."""

    def test_returns_true_for_valid_transition(self):
        """Should return true for valid transition."""
        assert can_transition("REQUESTED", "deliver") is True
        assert can_transition("PENDING_REVIEW", "approve") is True
        assert can_transition("EXPIRED", "escalate") is True

    def test_returns_false_for_invalid_transition(self):
        """Should return false for invalid transition."""
        assert can_transition("REQUESTED", "approve") is False
        assert can_transition("PENDING_REVIEW", "deliver") is False

    def test_returns_false_for_terminal_states(self):
        """Should return false for terminal states."""
        assert can_transition("APPROVED", "approve") is False
        assert can_transition("DENIED", "deliver") is False
        assert can_transition("REVOKED", "anything") is False
        assert can_transition("DENIED_TIMEOUT", "escalate") is False


class TestValidTriggers:
    """Test valid_triggers function."""

    def test_returns_valid_triggers_for_requested(self):
        """Should return valid triggers for REQUESTED state."""
        triggers = valid_triggers("REQUESTED")
        assert "deliver" in triggers
        assert "revoke" in triggers
        assert "approve" not in triggers

    def test_returns_valid_triggers_for_pending_review(self):
        """Should return valid triggers for PENDING_REVIEW state."""
        triggers = valid_triggers("PENDING_REVIEW")
        assert "approve" in triggers
        assert "deny" in triggers
        assert "timeout" in triggers
        assert "revoke" in triggers

    def test_returns_valid_triggers_for_expired(self):
        """Should return valid triggers for EXPIRED state."""
        triggers = valid_triggers("EXPIRED")
        assert "escalate" in triggers
        assert "exhaust_escalation" in triggers
        assert "revoke" in triggers

    def test_returns_empty_for_terminal_states(self):
        """Should return empty list for terminal states."""
        assert valid_triggers("APPROVED") == []
        assert valid_triggers("DENIED") == []
        assert valid_triggers("REVOKED") == []
        assert valid_triggers("DENIED_TIMEOUT") == []
