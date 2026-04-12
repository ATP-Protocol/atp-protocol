# ATP MCP Server Examples

Complete working examples demonstrating the ATP governance pipeline.

## Example 1: Basic Email Approval Workflow

Scenario: An AI agent needs to send emails to external vendors. The organization requires:
- Agent must be authorized (bound to org with "email" authority)
- Emails above $5000 in contract value require procurement manager approval
- Email credential (Gmail API token) must be stored

### Step 1: Register the Contract

```json
Request: atp_register_contract

{
  "contract_id": "ctr_send_email",
  "contract": {
    "version": "1.0.0",
    "authority": "org.procurement.send-email",
    "actions": ["send-email"],
    "attestation": "full",
    "approval": {
      "required": true,
      "required_above": 5000,
      "approver_role": "procurement_manager",
      "timeout": "PT4H"
    },
    "credentials": {
      "provider": "gmail-api",
      "scope": ["send"],
      "inject_as": "oauth_token",
      "fail_closed": true
    }
  }
}

Response:
{
  "contract_id": "ctr_send_email",
  "registered": true,
  "registered_at": "2026-04-12T10:30:00Z"
}
```

### Step 2: Store the Email Credential

```json
Request: atp_store_credential

{
  "key": "gmail_prod_1",
  "provider": "gmail-api",
  "credential_type": "oauth_token",
  "value": "ya29.a0AfH6SMBx...",
  "scope": ["send"],
  "org_id": "org_acme_corp",
  "expires_at": "2027-04-12T00:00:00Z"
}

Response:
{
  "key": "gmail_prod_1",
  "provider": "gmail-api",
  "org_id": "org_acme_corp",
  "credential_type": "oauth_token",
  "scope": ["send"],
  "stored_at": "2026-04-12T10:31:00Z",
  "expires_at": "2027-04-12T00:00:00Z"
}
```

### Step 3: Bind the Agent

```json
Request: atp_bind_authority

{
  "wallet": "0xAgent001",
  "org_id": "org_acme_corp",
  "role": "procurement_agent",
  "authorities": ["org.procurement.send-email"]
}

Response:
{
  "wallet": "0xAgent001",
  "org_id": "org_acme_corp",
  "role": "procurement_agent",
  "authorities": ["org.procurement.send-email"],
  "bound_at": "2026-04-12T10:32:00Z"
}
```

### Step 4: Execute a Small Email (No Approval Needed)

```json
Request: atp_govern_execute

{
  "contract_id": "ctr_send_email",
  "action": "send-email",
  "params": {
    "recipient": "vendor@example.com",
    "subject": "Follow-up",
    "body": "Hi, checking on your quote...",
    "amount": 500
  },
  "wallet": "0xAgent001"
}

Response:
{
  "execution_id": "exe_abc123",
  "outcome": "outcome:success",
  "result": {
    "message_id": "msg_xyz789",
    "sent_at": "2026-04-12T10:33:15Z"
  },
  "evidence_id": "evi_def456",
  "approval_id": null,
  "denied_reason": null,
  "denied_stage": null,
  "started_at": "2026-04-12T10:33:00Z",
  "completed_at": "2026-04-12T10:33:15Z"
}
```

### Step 5: Execute a Large Email (Approval Required)

```json
Request: atp_govern_execute

{
  "contract_id": "ctr_send_email",
  "action": "send-email",
  "params": {
    "recipient": "vendor@example.com",
    "subject": "PO-12345",
    "body": "Attached is purchase order for $50,000...",
    "amount": 50000
  },
  "wallet": "0xAgent001"
}

Response:
{
  "execution_id": "exe_xyz789",
  "outcome": "outcome:denied",
  "result": null,
  "evidence_id": "evi_ghi789",
  "approval_id": "apr_mno456",
  "denied_reason": "Approval required from role \"procurement_manager\". Approval ID: apr_mno456",
  "denied_stage": "approval",
  "started_at": "2026-04-12T10:35:00Z",
  "completed_at": "2026-04-12T10:35:02Z"
}
```

### Step 6: Approver Reviews Pending Requests

```json
Request: atp_list_pending_approvals

{}

Response:
{
  "pending_count": 1,
  "pending_approvals": [
    {
      "approval_id": "apr_mno456",
      "contract_id": "ctr_send_email",
      "action": "send-email",
      "requesting_wallet": "0xAgent001",
      "approver_role": "procurement_manager",
      "scope_params": {
        "recipient": "vendor@example.com",
        "subject": "PO-12345",
        "body": "Attached is purchase order for $50,000...",
        "amount": 50000
      },
      "created_at": "2026-04-12T10:35:00Z",
      "state": "PENDING_REVIEW"
    }
  ],
  "listed_at": "2026-04-12T10:36:00Z"
}
```

### Step 7: Approver Approves the Request

```json
Request: atp_approve

{
  "approval_id": "apr_mno456",
  "approver_wallet": "0xManager001",
  "approver_role": "procurement_manager"
}

Response:
{
  "approval_id": "apr_mno456",
  "approved": true,
  "approver_wallet": "0xManager001",
  "approver_role": "procurement_manager",
  "approved_at": "2026-04-12T10:37:00Z",
  "execution": {
    "execution_id": "exe_xyz789",
    "outcome": "outcome:success",
    "result": {
      "message_id": "msg_xyz789",
      "sent_at": "2026-04-12T10:37:15Z"
    },
    "evidence_id": "evi_jkl012",
    "denied_reason": null,
    "denied_stage": null
  }
}
```

### Step 8: Retrieve Evidence

```json
Request: atp_get_evidence

{
  "evidence_id": "evi_jkl012"
}

Response:
{
  "found": true,
  "evidence_id": "evi_jkl012",
  "execution_id": "exe_xyz789",
  "contract_id": "ctr_send_email",
  "action": "send-email",
  "authority": "org.procurement.send-email",
  "requesting_wallet": "0xAgent001",
  "requesting_org": "org_acme_corp",
  "outcome": "outcome:success",
  "scope_snapshot": {
    "recipient": "vendor@example.com",
    "subject": "PO-12345",
    "amount": 50000
  },
  "approval_id": "apr_mno456",
  "credential_provider": "gmail-api",
  "credential_scope_used": ["send"],
  "policy_snapshot": {
    "policies_evaluated": 1,
    "constraints_applied": [
      {
        "source": "contract",
        "field": "amount",
        "value": 50000
      }
    ]
  },
  "timestamps": {
    "requested_at": "2026-04-12T10:35:00Z",
    "authorized_at": "2026-04-12T10:35:01Z",
    "approved_at": "2026-04-12T10:37:00Z",
    "executed_at": "2026-04-12T10:37:15Z",
    "evidenced_at": "2026-04-12T10:37:15Z"
  },
  "attestation_level": "full",
  "evidence_status": "confirmed"
}
```

---

## Example 2: GitHub Action with Policy Constraints

Scenario: An AI agent creates GitHub pull requests but must follow org policies:
- Only to approved repositories
- Only during business hours (9am-5pm UTC)
- Rate limit: max 5 PRs per hour per person

### Register Contract with Policy

```json
Request: atp_register_contract

{
  "contract_id": "ctr_create_pr",
  "contract": {
    "version": "1.0.0",
    "authority": "org.engineering.create-pr",
    "actions": ["create-pr"],
    "attestation": "light",
    "scope": {
      "repositories": {
        "type": "enumeration",
        "allowed": [
          "org/main-repo",
          "org/sdk-repo",
          "org/docs"
        ]
      },
      "time": {
        "type": "temporal",
        "allowed_hours": "09:00-17:00 UTC"
      }
    },
    "credentials": {
      "provider": "github-api",
      "scope": ["repo", "workflow"],
      "inject_as": "bearer_token"
    }
  }
}

Response:
{
  "contract_id": "ctr_create_pr",
  "registered": true
}
```

### Validate Before Execution

```json
Request: atp_evaluate_policy

{
  "contract": {
    "version": "1.0.0",
    "authority": "org.engineering.create-pr",
    "actions": ["create-pr"],
    "attestation": "light",
    "scope": {...}
  },
  "params": {
    "repository": "org/main-repo",
    "title": "Add feature X",
    "time": "2026-04-12T14:30:00Z"
  }
}

Response:
{
  "permitted": true,
  "policies_evaluated": 2,
  "constraints_applied": [
    {
      "source": "contract",
      "field": "repositories",
      "value": "org/main-repo"
    },
    {
      "source": "contract",
      "field": "time",
      "value": "2026-04-12T14:30:00Z"
    }
  ],
  "denial_reason": null,
  "denial_source": null,
  "evaluated_at": "2026-04-12T14:30:00Z"
}
```

### Execute

```json
Request: atp_govern_execute

{
  "contract_id": "ctr_create_pr",
  "action": "create-pr",
  "params": {
    "repository": "org/main-repo",
    "title": "Add feature X",
    "description": "This PR adds feature X...",
    "branch": "feat/feature-x"
  },
  "wallet": "0xEngineer001"
}

Response:
{
  "execution_id": "exe_pr123",
  "outcome": "outcome:success",
  "result": {
    "pr_number": 4521,
    "pr_url": "https://github.com/org/main-repo/pull/4521"
  },
  "evidence_id": "evi_pr456"
}
```

---

## Example 3: Testing Authorization Denial

Scenario: An agent tries to execute an action it's not authorized for.

### Bind Agent with Wrong Authority

```json
Request: atp_bind_authority

{
  "wallet": "0xAgent002",
  "org_id": "org_acme_corp",
  "role": "reader",
  "authorities": ["org.read-only.*"]
}

Response:
{
  "wallet": "0xAgent002",
  "bound": true
}
```

### Try to Execute Email (Authorized Action)

```json
Request: atp_govern_execute

{
  "contract_id": "ctr_send_email",
  "action": "send-email",
  "params": {
    "recipient": "someone@example.com",
    "subject": "Hello",
    "amount": 1000
  },
  "wallet": "0xAgent002"
}

Response:
{
  "execution_id": "exe_denied123",
  "outcome": "outcome:denied",
  "result": null,
  "evidence_id": "evi_denied456",
  "denied_reason": "wallet_not_bound or role_missing_authority: Agent has [org.read-only.*] but needs [org.procurement.send-email]",
  "denied_stage": "authority",
  "started_at": "2026-04-12T14:45:00Z",
  "completed_at": "2026-04-12T14:45:00Z"
}
```

---

## Example 4: Idempotency

Scenario: Agent wants to send an email but is unsure if it was already sent. Use idempotency key.

### First Request

```json
Request: atp_govern_execute

{
  "contract_id": "ctr_send_email",
  "action": "send-email",
  "params": {
    "recipient": "vendor@example.com",
    "subject": "Quote Request",
    "amount": 1000
  },
  "wallet": "0xAgent001",
  "idempotency_key": "email_vendor_quote_20260412"
}

Response:
{
  "execution_id": "exe_abc123",
  "outcome": "outcome:success",
  "result": {
    "message_id": "msg_xyz789"
  },
  "evidence_id": "evi_def456"
}
```

### Retry with Same Key (Returns Same Result)

```json
Request: atp_govern_execute

{
  "contract_id": "ctr_send_email",
  "action": "send-email",
  "params": {
    "recipient": "vendor@example.com",
    "subject": "Quote Request",
    "amount": 1000
  },
  "wallet": "0xAgent001",
  "idempotency_key": "email_vendor_quote_20260412"
}

Response: (Identical to first response — no re-execution)
{
  "execution_id": "exe_abc123",
  "outcome": "outcome:success",
  "result": {
    "message_id": "msg_xyz789"
  },
  "evidence_id": "evi_def456"
}
```

---

## Example 5: Checking Gateway Status

```json
Request: atp_gateway_status

{}

Response:
{
  "gateway_id": "mcp_atp_gateway",
  "atp_version": "1.0.0",
  "conformance_level": "verified",
  "dual_integration": false,
  "contracts": {
    "total": 3,
    "registered": 3,
    "revoked": 0
  },
  "approvals": {
    "pending": 2
  },
  "evidence": {
    "total_records": 47,
    "success_count": 45,
    "denied_count": 2,
    "failure_count": 0
  },
  "status": "operational",
  "queried_at": "2026-04-12T14:50:00Z"
}
```

---

## Integration Pattern: Building an Agent Loop

```pseudocode
Loop:
  1. Get task from user
  2. Determine which ATP contract applies
  3. Check if approval needed: atp_check_approval
  4. If approval needed, skip to approval loop
  5. Execute through governance: atp_govern_execute
  6. If outcome:success, return result to user
  7. If outcome:denied, explain reason to user
  8. If outcome:failure, log error and retry
  
Approval Loop:
  1. User provides approval_id
  2. Approver reviews: atp_list_pending_approvals
  3. Approver approves: atp_approve
  4. System completes execution
  5. Return final result to user
```

---

See README.md for configuration and troubleshooting.
