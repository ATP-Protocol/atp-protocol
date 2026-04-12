"""
Tests for ATP policy evaluation.

Tests policy constraint evaluation and merging.
"""

import pytest
from atp_protocol import evaluate_policy, merge_constraints


class TestEvaluatePolicy:
    """Test policy evaluation."""

    def test_returns_permitted_with_no_scope(self):
        """Should return permitted=true when contract has no scope."""
        contract = {
            "version": "1.0.0",
            "authority": "org.test.action",
            "actions": ["test"],
            "attestation": "full",
        }
        result = evaluate_policy(contract, {})
        assert result.permitted is True
        assert result.policies_evaluated == 0

    def test_returns_permitted_with_empty_scope(self):
        """Should return permitted=true when scope is empty."""
        contract = {
            "version": "1.0.0",
            "authority": "org.test.action",
            "actions": ["test"],
            "attestation": "full",
            "scope": {},
        }
        result = evaluate_policy(contract, {})
        assert result.permitted is True

    # Enumeration constraints
    def test_permits_enumeration_match(self):
        """Should permit when value matches enumeration."""
        contract = {
            "version": "1.0.0",
            "authority": "org.test.action",
            "actions": ["test"],
            "attestation": "full",
            "scope": {"status": ["pending", "approved", "rejected"]},
        }
        result = evaluate_policy(contract, {"status": "approved"})
        assert result.permitted is True

    def test_denies_enumeration_mismatch(self):
        """Should deny when value not in enumeration."""
        contract = {
            "version": "1.0.0",
            "authority": "org.test.action",
            "actions": ["test"],
            "attestation": "full",
            "scope": {"status": ["pending", "approved"]},
        }
        result = evaluate_policy(contract, {"status": "invalid"})
        assert result.permitted is False
        assert "not in the permitted set" in result.denial_reason

    # Domain matching
    def test_permits_domain_suffix_match(self):
        """Should permit email matching @domain pattern."""
        contract = {
            "version": "1.0.0",
            "authority": "org.test.action",
            "actions": ["test"],
            "attestation": "full",
            "scope": {"email": ["@company.com", "@contractor.io"]},
        }
        result = evaluate_policy(contract, {"email": "user@company.com"})
        assert result.permitted is True

    def test_denies_domain_suffix_mismatch(self):
        """Should deny email not matching @domain pattern."""
        contract = {
            "version": "1.0.0",
            "authority": "org.test.action",
            "actions": ["test"],
            "attestation": "full",
            "scope": {"email": ["@company.com"]},
        }
        result = evaluate_policy(contract, {"email": "user@other.com"})
        assert result.permitted is False

    # Numeric max constraints
    def test_permits_numeric_max_at_limit(self):
        """Should permit value equal to max."""
        contract = {
            "version": "1.0.0",
            "authority": "org.test.action",
            "actions": ["test"],
            "attestation": "full",
            "scope": {"max_amount": 1000},
        }
        result = evaluate_policy(contract, {"max_amount": 1000})
        assert result.permitted is True

    def test_permits_numeric_max_below_limit(self):
        """Should permit value below max."""
        contract = {
            "version": "1.0.0",
            "authority": "org.test.action",
            "actions": ["test"],
            "attestation": "full",
            "scope": {"max_amount": 1000},
        }
        result = evaluate_policy(contract, {"max_amount": 500})
        assert result.permitted is True

    def test_denies_numeric_max_exceeded(self):
        """Should deny value exceeding max."""
        contract = {
            "version": "1.0.0",
            "authority": "org.test.action",
            "actions": ["test"],
            "attestation": "full",
            "scope": {"max_amount": 1000},
        }
        result = evaluate_policy(contract, {"max_amount": 1500})
        assert result.permitted is False
        assert "exceeds maximum" in result.denial_reason

    # Numeric min constraints
    def test_permits_numeric_min_at_limit(self):
        """Should permit value equal to min."""
        contract = {
            "version": "1.0.0",
            "authority": "org.test.action",
            "actions": ["test"],
            "attestation": "full",
            "scope": {"min_age": 18},
        }
        result = evaluate_policy(contract, {"min_age": 18})
        assert result.permitted is True

    def test_permits_numeric_min_above_limit(self):
        """Should permit value above min."""
        contract = {
            "version": "1.0.0",
            "authority": "org.test.action",
            "actions": ["test"],
            "attestation": "full",
            "scope": {"min_age": 18},
        }
        result = evaluate_policy(contract, {"min_age": 25})
        assert result.permitted is True

    def test_denies_numeric_min_below_limit(self):
        """Should deny value below min."""
        contract = {
            "version": "1.0.0",
            "authority": "org.test.action",
            "actions": ["test"],
            "attestation": "full",
            "scope": {"min_age": 18},
        }
        result = evaluate_policy(contract, {"min_age": 16})
        assert result.permitted is False
        assert "below minimum" in result.denial_reason

    # Boolean constraints
    def test_permits_boolean_true(self):
        """Should permit when boolean constraint is true and value is provided."""
        contract = {
            "version": "1.0.0",
            "authority": "org.test.action",
            "actions": ["test"],
            "attestation": "full",
            "scope": {"require_mfa": True},
        }
        result = evaluate_policy(contract, {"require_mfa": True})
        assert result.permitted is True

    def test_denies_boolean_false(self):
        """Should deny when boolean constraint is false and value is truthy."""
        contract = {
            "version": "1.0.0",
            "authority": "org.test.action",
            "actions": ["test"],
            "attestation": "full",
            "scope": {"allow_export": False},
        }
        result = evaluate_policy(contract, {"allow_export": True})
        assert result.permitted is False
        assert "not allowed by policy" in result.denial_reason

    # Pattern constraints
    def test_permits_pattern_match(self):
        """Should permit when value matches regex pattern."""
        contract = {
            "version": "1.0.0",
            "authority": "org.test.action",
            "actions": ["test"],
            "attestation": "full",
            "scope": {"email_pattern": r"^[^@]+@example\.com$"},
        }
        result = evaluate_policy(contract, {"email_pattern": "user@example.com"})
        assert result.permitted is True

    def test_denies_pattern_mismatch(self):
        """Should deny when value doesn't match pattern."""
        contract = {
            "version": "1.0.0",
            "authority": "org.test.action",
            "actions": ["test"],
            "attestation": "full",
            "scope": {"email_pattern": r"^[^@]+@example\.com$"},
        }
        result = evaluate_policy(contract, {"email_pattern": "user@other.com"})
        assert result.permitted is False

    def test_denies_invalid_pattern(self):
        """Should deny with invalid regex pattern."""
        contract = {
            "version": "1.0.0",
            "authority": "org.test.action",
            "actions": ["test"],
            "attestation": "full",
            "scope": {"bad_pattern": "[invalid(regex"},
        }
        result = evaluate_policy(contract, {"bad_pattern": "anything"})
        assert result.permitted is False
        assert "Invalid pattern" in result.denial_reason

    # Deny list (must check before enumeration)
    def test_denies_prohibited_content(self):
        """Should deny content matching prohibited terms."""
        contract = {
            "version": "1.0.0",
            "authority": "org.test.action",
            "actions": ["test"],
            "attestation": "full",
            "scope": {"prohibited_terms": ["password", "secret", "key"]},
        }
        result = evaluate_policy(contract, {"prohibited_terms": "Please enter your password"})
        assert result.permitted is False
        assert "prohibited term" in result.denial_reason

    def test_permits_content_without_prohibited_terms(self):
        """Should permit content without prohibited terms."""
        contract = {
            "version": "1.0.0",
            "authority": "org.test.action",
            "actions": ["test"],
            "attestation": "full",
            "scope": {"prohibited_content": ["password", "secret"]},
        }
        result = evaluate_policy(contract, {"prohibited_content": "This is safe content"})
        assert result.permitted is True

    def test_deny_list_checked_before_enumeration(self):
        """Deny list constraints should be checked before enumeration."""
        contract = {
            "version": "1.0.0",
            "authority": "org.test.action",
            "actions": ["test"],
            "attestation": "full",
            "scope": {
                "prohibited_keywords": ["reject", "forbidden"],
                "status": ["approve", "reject", "pending"],
            },
        }
        # 'reject' is in both prohibited and enumeration, deny list should win
        result = evaluate_policy(contract, {"prohibited_keywords": "reject", "status": "reject"})
        # The deny list should trigger first
        assert result.permitted is False

    # Rate limit constraints (not enforced locally)
    def test_permits_rate_limit_constraint(self):
        """Should permit but record rate limit constraints (not enforced locally)."""
        contract = {
            "version": "1.0.0",
            "authority": "org.test.action",
            "actions": ["test"],
            "attestation": "full",
            "scope": {"api_calls": {"max": 100, "per": "PT1H"}},
        }
        result = evaluate_policy(contract, {})
        assert result.permitted is True
        assert len(result.constraints_applied) == 1

    # Combined constraints
    def test_evaluates_multiple_constraints(self):
        """Should evaluate multiple constraint types."""
        contract = {
            "version": "1.0.0",
            "authority": "org.test.action",
            "actions": ["test"],
            "attestation": "full",
            "scope": {
                "email": ["@company.com"],
                "max_amount": 5000,
                "min_age": 18,
            },
        }
        result = evaluate_policy(contract, {
            "email": "user@company.com",
            "max_amount": 3000,
            "min_age": 25,
        })
        assert result.permitted is True
        assert result.policies_evaluated == 3

    def test_fails_on_first_violation(self):
        """Should deny on first constraint violation."""
        contract = {
            "version": "1.0.0",
            "authority": "org.test.action",
            "actions": ["test"],
            "attestation": "full",
            "scope": {
                "max_amount": 1000,
                "email": ["@company.com"],
            },
        }
        result = evaluate_policy(contract, {
            "max_amount": 5000,  # Violates max
            "email": "user@bad.com",  # Also violates
        })
        assert result.permitted is False
        # Should fail on first violation


class TestMergeConstraints:
    """Test constraint merging."""

    def test_merges_empty_policies(self):
        """Should handle merging empty policies."""
        result = merge_constraints({}, {})
        assert result == {}

    def test_merges_simple_addition(self):
        """Should add new fields from policies."""
        result = merge_constraints(
            {"field1": "value1"},
            {"field2": "value2"}
        )
        assert result == {"field1": "value1", "field2": "value2"}

    # Enumeration merging (intersection)
    def test_merges_enumeration_intersection(self):
        """Should intersect enumeration constraints."""
        result = merge_constraints(
            {"status": ["pending", "approved", "rejected"]},
            {"status": ["approved", "rejected", "archived"]}
        )
        assert set(result["status"]) == {"approved", "rejected"}

    def test_merges_enumeration_empty_intersection(self):
        """Should return empty list for non-overlapping enumerations."""
        result = merge_constraints(
            {"status": ["pending"]},
            {"status": ["approved"]}
        )
        assert result["status"] == []

    # Numeric max merging (lowest wins)
    def test_merges_numeric_max_takes_lowest(self):
        """Should take the lowest max value."""
        result = merge_constraints(
            {"max_amount": 5000},
            {"max_amount": 3000}
        )
        assert result["max_amount"] == 3000

    # Numeric min merging (highest wins)
    def test_merges_numeric_min_takes_highest(self):
        """Should take the highest min value."""
        result = merge_constraints(
            {"min_age": 18},
            {"min_age": 21}
        )
        assert result["min_age"] == 21

    # Boolean merging (false wins)
    def test_merges_boolean_false_wins(self):
        """Should use false for boolean constraints (most restrictive)."""
        result = merge_constraints(
            {"allow_export": True},
            {"allow_export": False}
        )
        assert result["allow_export"] is False

    def test_merges_boolean_both_true(self):
        """Should keep true when both are true."""
        result = merge_constraints(
            {"allow_export": True},
            {"allow_export": True}
        )
        assert result["allow_export"] is True

    # Rate limit merging (lowest max wins)
    def test_merges_rate_limits_takes_lowest(self):
        """Should take rate limit with lowest max."""
        result = merge_constraints(
            {"api_calls": {"max": 100, "per": "PT1H"}},
            {"api_calls": {"max": 50, "per": "PT1H"}}
        )
        assert result["api_calls"]["max"] == 50

    # Fallback behavior (later wins)
    def test_fallback_later_policy_wins(self):
        """Should use later policy for unknown constraint types."""
        result = merge_constraints(
            {"custom_field": "value1"},
            {"custom_field": "value2"}
        )
        assert result["custom_field"] == "value2"

    # Complex merge
    def test_merges_complex_constraint_set(self):
        """Should merge complex constraint sets correctly."""
        org_policies = {
            "email": ["@company.com", "@contractor.io"],
            "max_amount": 10000,
            "min_age": 18,
            "require_mfa": True,
        }
        contract_policies = {
            "email": ["@company.com"],
            "max_amount": 5000,
            "min_age": 21,
            "require_mfa": True,
        }
        result = merge_constraints(org_policies, contract_policies)

        assert result["email"] == ["@company.com"]
        assert result["max_amount"] == 5000
        assert result["min_age"] == 21
        assert result["require_mfa"] is True
