"""
Tests for ATP contract validation.

Mirrors the TypeScript test suite from sdk/ts/src/__tests__/contract.test.ts
"""

import pytest
from datetime import datetime, timedelta
from atp_protocol import (
    validate_contract,
    is_contract_expired,
    requires_approval,
    parse_escalation_path,
    ValidationError,
)


# Valid contract fixture
VALID_CONTRACT = {
    "version": "1.0.0",
    "authority": "org.procurement.send-email",
    "template": "tpl_purchase_order_comms",
    "actions": ["send-email"],
    "scope": {
        "recipient_domain": ["@approved-vendors.com", "@internal.company.com"],
        "max_attachments": 3,
        "prohibited_content": ["payment instructions", "wire transfer"],
    },
    "approval": {
        "required": True,
        "required_above": None,
        "approver_role": "procurement_manager",
        "timeout": "PT4H",
        "escalation_path": "department_head,cfo",
    },
    "credentials": {
        "provider": "gmail-api",
        "scope": ["send"],
        "inject_as": "oauth_token",
        "fail_closed": True,
    },
    "output": {
        "object_type": "procurement_communication",
        "initial_state": "sent",
        "schema_ref": "schemas/procurement-email-v1.json",
    },
    "attestation": "full",
    "revocable": True,
    "expiry": "2030-07-11T00:00:00Z",
    "idempotency": "gateway-enforced",
}


class TestValidateContract:
    """Test contract validation."""

    def test_accepts_valid_contract(self):
        """Should accept a valid contract."""
        result = validate_contract(VALID_CONTRACT)
        assert result.valid is True
        assert len(result.errors) == 0

    def test_accepts_minimal_contract(self):
        """Should accept a minimal contract (required fields only)."""
        minimal = {
            "version": "1.0.0",
            "authority": "org.finance.approve-payment",
            "actions": ["approve-payment"],
            "attestation": "full",
        }
        result = validate_contract(minimal)
        assert result.valid is True
        assert len(result.errors) == 0

    def test_rejects_null_input(self):
        """Should reject null input."""
        result = validate_contract(None)
        assert result.valid is False
        assert len(result.errors) == 1
        assert result.errors[0].code == "INVALID_TYPE"

    def test_rejects_non_object_input(self):
        """Should reject non-object input."""
        result = validate_contract("not a contract")
        assert result.valid is False

    # Required fields
    def test_rejects_missing_version(self):
        """Should reject missing version."""
        contract = {k: v for k, v in VALID_CONTRACT.items() if k != "version"}
        result = validate_contract(contract)
        assert result.valid is False
        assert any(e.field == "version" for e in result.errors)

    def test_rejects_missing_authority(self):
        """Should reject missing authority."""
        contract = {k: v for k, v in VALID_CONTRACT.items() if k != "authority"}
        result = validate_contract(contract)
        assert result.valid is False
        assert any(e.field == "authority" for e in result.errors)

    def test_rejects_missing_actions(self):
        """Should reject missing actions."""
        contract = {k: v for k, v in VALID_CONTRACT.items() if k != "actions"}
        result = validate_contract(contract)
        assert result.valid is False
        assert any(e.field == "actions" for e in result.errors)

    def test_rejects_missing_attestation(self):
        """Should reject missing attestation."""
        contract = {k: v for k, v in VALID_CONTRACT.items() if k != "attestation"}
        result = validate_contract(contract)
        assert result.valid is False
        assert any(e.field == "attestation" for e in result.errors)

    # Version format
    def test_rejects_invalid_semver(self):
        """Should reject invalid semver versions."""
        contract = dict(VALID_CONTRACT)
        contract["version"] = "1.0"  # Missing patch
        result = validate_contract(contract)
        assert result.valid is False
        assert any(e.field == "version" for e in result.errors)

    def test_accepts_valid_semver(self):
        """Should accept valid semver versions."""
        contract = dict(VALID_CONTRACT)
        contract["version"] = "2.5.10"
        result = validate_contract(contract)
        assert result.valid is True

    # Authority format
    def test_rejects_invalid_authority_format(self):
        """Should reject invalid authority format."""
        contract = dict(VALID_CONTRACT)
        contract["authority"] = "invalid-authority"
        result = validate_contract(contract)
        assert result.valid is False
        assert any(e.field == "authority" for e in result.errors)

    def test_accepts_valid_authority_format(self):
        """Should accept valid authority format."""
        contract = dict(VALID_CONTRACT)
        contract["authority"] = "org.mycompany.permission-name"
        result = validate_contract(contract)
        assert result.valid is True

    # Actions array
    def test_rejects_empty_actions_array(self):
        """Should reject empty actions array."""
        contract = dict(VALID_CONTRACT)
        contract["actions"] = []
        result = validate_contract(contract)
        assert result.valid is False
        assert any(e.field == "actions" for e in result.errors)

    def test_rejects_non_string_action(self):
        """Should reject non-string actions."""
        contract = dict(VALID_CONTRACT)
        contract["actions"] = ["valid", 123, "another"]
        result = validate_contract(contract)
        assert result.valid is False
        assert any("actions[1]" in e.field for e in result.errors)

    def test_accepts_valid_actions(self):
        """Should accept valid actions."""
        contract = dict(VALID_CONTRACT)
        contract["actions"] = ["send-email", "create-record", "update-doc"]
        result = validate_contract(contract)
        assert result.valid is True

    # Attestation
    def test_rejects_invalid_attestation_level(self):
        """Should reject invalid attestation level."""
        contract = dict(VALID_CONTRACT)
        contract["attestation"] = "partial"
        result = validate_contract(contract)
        assert result.valid is False
        assert any(e.field == "attestation" for e in result.errors)

    def test_warns_on_dev_only_attestation(self):
        """Should warn on dev-only attestation='none'."""
        contract = dict(VALID_CONTRACT)
        contract["attestation"] = "none"
        result = validate_contract(contract)
        assert result.valid is True
        assert any(w.code == "DEV_ONLY_ATTESTATION" for w in result.warnings)

    # Idempotency
    def test_rejects_invalid_idempotency_model(self):
        """Should reject invalid idempotency model."""
        contract = dict(VALID_CONTRACT)
        contract["idempotency"] = "unknown"
        result = validate_contract(contract)
        assert result.valid is False
        assert any(e.field == "idempotency" for e in result.errors)

    def test_rejects_unsafe_idempotency_without_ack(self):
        """Should reject unsafe idempotency without scope.idempotency_ack."""
        contract = dict(VALID_CONTRACT)
        contract["idempotency"] = "unsafe"
        contract["scope"] = {}
        result = validate_contract(contract)
        assert result.valid is False
        assert any(e.code == "MISSING_IDEMPOTENCY_ACK" for e in result.errors)

    def test_accepts_unsafe_idempotency_with_ack(self):
        """Should accept unsafe idempotency with scope.idempotency_ack."""
        contract = dict(VALID_CONTRACT)
        contract["idempotency"] = "unsafe"
        contract["scope"] = {"idempotency_ack": True}
        result = validate_contract(contract)
        assert result.valid is True

    def test_warns_on_unsafe_idempotency(self):
        """Should warn about unsafe idempotency."""
        contract = dict(VALID_CONTRACT)
        contract["idempotency"] = "unsafe"
        contract["scope"] = {"idempotency_ack": True}
        result = validate_contract(contract)
        assert any(w.code == "UNSAFE_IDEMPOTENCY" for w in result.warnings)

    # Approval config
    def test_rejects_invalid_approval_timeout(self):
        """Should reject invalid approval timeout format."""
        contract = dict(VALID_CONTRACT)
        contract["approval"] = {"timeout": "not-iso-duration"}
        result = validate_contract(contract)
        assert result.valid is False
        assert any(e.field == "approval.timeout" for e in result.errors)

    def test_accepts_valid_approval_timeout(self):
        """Should accept valid ISO 8601 duration."""
        contract = dict(VALID_CONTRACT)
        contract["approval"] = {"timeout": "PT4H"}
        result = validate_contract(contract)
        assert result.valid is True

    def test_warns_on_missing_approver_role(self):
        """Should warn when approval required but no approver_role."""
        contract = dict(VALID_CONTRACT)
        contract["approval"] = {"required": True}
        result = validate_contract(contract)
        assert any(w.code == "MISSING_APPROVER_ROLE" for w in result.warnings)

    # Credentials config
    def test_rejects_invalid_injection_method(self):
        """Should reject invalid inject_as method."""
        contract = dict(VALID_CONTRACT)
        contract["credentials"] = {"inject_as": "unknown_method"}
        result = validate_contract(contract)
        assert result.valid is False
        assert any(e.field == "credentials.inject_as" for e in result.errors)

    def test_accepts_valid_injection_methods(self):
        """Should accept all valid injection methods."""
        for method in ["oauth_token", "api_key", "bearer_token", "basic_auth", "custom"]:
            contract = dict(VALID_CONTRACT)
            contract["credentials"] = {"inject_as": method}
            result = validate_contract(contract)
            assert result.valid is True

    def test_warns_on_fail_open_credentials(self):
        """Should warn when fail_closed=false."""
        contract = dict(VALID_CONTRACT)
        contract["credentials"] = {"fail_closed": False}
        result = validate_contract(contract)
        assert any(w.code == "DEV_ONLY_FAIL_OPEN" for w in result.warnings)

    # Expiry
    def test_rejects_invalid_expiry_format(self):
        """Should reject invalid expiry format."""
        contract = dict(VALID_CONTRACT)
        contract["expiry"] = "not-a-date"
        result = validate_contract(contract)
        assert result.valid is False
        assert any(e.field == "expiry" for e in result.errors)

    def test_warns_on_past_expiry(self):
        """Should warn when expiry is in the past."""
        contract = dict(VALID_CONTRACT)
        past_date = (datetime.utcnow() - timedelta(days=1)).isoformat() + "Z"
        contract["expiry"] = past_date
        result = validate_contract(contract)
        assert any(w.code == "EXPIRED_CONTRACT" for w in result.warnings)

    def test_accepts_future_expiry(self):
        """Should accept future expiry."""
        contract = dict(VALID_CONTRACT)
        future_date = (datetime.utcnow() + timedelta(days=30)).isoformat() + "Z"
        contract["expiry"] = future_date
        result = validate_contract(contract)
        assert result.valid is True

    # Execution timeout
    def test_rejects_invalid_execution_timeout(self):
        """Should reject invalid execution_timeout format."""
        contract = dict(VALID_CONTRACT)
        contract["execution_timeout"] = "not-iso-duration"
        result = validate_contract(contract)
        assert result.valid is False
        assert any(e.field == "execution_timeout" for e in result.errors)

    def test_accepts_valid_execution_timeout(self):
        """Should accept valid ISO 8601 duration."""
        contract = dict(VALID_CONTRACT)
        contract["execution_timeout"] = "PT30M"
        result = validate_contract(contract)
        assert result.valid is True

    # Delegation
    def test_rejects_invalid_delegation_depth(self):
        """Should reject invalid max_depth."""
        contract = dict(VALID_CONTRACT)
        contract["delegation"] = {"max_depth": 10}
        result = validate_contract(contract)
        assert result.valid is False
        assert any(e.field == "delegation.max_depth" for e in result.errors)

    def test_accepts_valid_delegation_depth(self):
        """Should accept valid max_depth (0-5)."""
        for depth in [0, 1, 2, 3, 4, 5]:
            contract = dict(VALID_CONTRACT)
            contract["delegation"] = {"max_depth": depth}
            result = validate_contract(contract)
            assert result.valid is True


class TestIsContractExpired:
    """Test contract expiry checking."""

    def test_returns_false_for_no_expiry(self):
        """Should return False when no expiry is set."""
        contract = dict(VALID_CONTRACT)
        del contract["expiry"]
        assert is_contract_expired(contract) is False

    def test_returns_false_for_future_expiry(self):
        """Should return False for future expiry."""
        contract = dict(VALID_CONTRACT)
        contract["expiry"] = (datetime.utcnow() + timedelta(days=30)).isoformat() + "Z"
        assert is_contract_expired(contract) is False

    def test_returns_true_for_past_expiry(self):
        """Should return True for past expiry."""
        contract = dict(VALID_CONTRACT)
        contract["expiry"] = (datetime.utcnow() - timedelta(days=1)).isoformat() + "Z"
        assert is_contract_expired(contract) is True

    def test_returns_false_for_invalid_expiry(self):
        """Should return False for invalid expiry format."""
        contract = dict(VALID_CONTRACT)
        contract["expiry"] = "not-a-date"
        assert is_contract_expired(contract) is False


class TestRequiresApproval:
    """Test approval requirement checking."""

    def test_returns_false_when_approval_not_required(self):
        """Should return False when approval.required is false."""
        contract = dict(VALID_CONTRACT)
        contract["approval"] = {"required": False}
        assert requires_approval(contract) is False

    def test_returns_false_when_no_approval_config(self):
        """Should return False when no approval config."""
        contract = dict(VALID_CONTRACT)
        del contract["approval"]
        assert requires_approval(contract) is False

    def test_returns_true_when_always_required(self):
        """Should return True when approval is always required."""
        contract = dict(VALID_CONTRACT)
        contract["approval"] = {"required": True, "required_above": None}
        assert requires_approval(contract) is True

    def test_returns_true_when_amount_exceeds_threshold(self):
        """Should return True when amount exceeds required_above."""
        contract = dict(VALID_CONTRACT)
        contract["approval"] = {"required": True, "required_above": 1000}
        assert requires_approval(contract, amount=1500) is True

    def test_returns_false_when_amount_below_threshold(self):
        """Should return False when amount is below required_above."""
        contract = dict(VALID_CONTRACT)
        contract["approval"] = {"required": True, "required_above": 1000}
        assert requires_approval(contract, amount=500) is False

    def test_returns_false_when_no_amount_provided(self):
        """Should return False when no amount provided and required_above set."""
        contract = dict(VALID_CONTRACT)
        contract["approval"] = {"required": True, "required_above": 1000}
        assert requires_approval(contract) is False


class TestParseEscalationPath:
    """Test escalation path parsing."""

    def test_returns_empty_list_when_no_approval(self):
        """Should return empty list when no approval config."""
        contract = dict(VALID_CONTRACT)
        del contract["approval"]
        assert parse_escalation_path(contract) == []

    def test_returns_empty_list_when_no_escalation_path(self):
        """Should return empty list when no escalation_path."""
        contract = dict(VALID_CONTRACT)
        contract["approval"] = {"required": True}
        assert parse_escalation_path(contract) == []

    def test_parses_single_role(self):
        """Should parse single role."""
        contract = dict(VALID_CONTRACT)
        contract["approval"] = {"escalation_path": "supervisor"}
        assert parse_escalation_path(contract) == ["supervisor"]

    def test_parses_multiple_roles(self):
        """Should parse comma-separated roles."""
        contract = dict(VALID_CONTRACT)
        contract["approval"] = {"escalation_path": "supervisor,manager,director"}
        assert parse_escalation_path(contract) == ["supervisor", "manager", "director"]

    def test_trims_whitespace(self):
        """Should trim whitespace from roles."""
        contract = dict(VALID_CONTRACT)
        contract["approval"] = {"escalation_path": "  supervisor  ,  manager  ,  director  "}
        assert parse_escalation_path(contract) == ["supervisor", "manager", "director"]

    def test_filters_empty_roles(self):
        """Should filter empty roles."""
        contract = dict(VALID_CONTRACT)
        contract["approval"] = {"escalation_path": "supervisor,,manager"}
        assert parse_escalation_path(contract) == ["supervisor", "manager"]
