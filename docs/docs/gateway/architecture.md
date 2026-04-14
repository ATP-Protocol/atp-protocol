---
sidebar_position: 2
---

# Gateway Architecture

This page describes the internal architecture of the ATP gateway: its components, data flows, and design decisions.

## Component Overview

```
┌────────────────────────────────────────────────────────┐
│                  HTTP/gRPC Server                       │
│               (receives action proposals)               │
└─────────────────────┬──────────────────────────────────┘
                      │
        ┌─────────────┼─────────────┐
        ▼             ▼             ▼
    ┌────────┐  ┌────────┐  ┌──────────┐
    │Request │  │Request │  │Request   │
    │Router  │  │Validator│  │Deduper  │
    └───┬────┘  └───┬────┘  └────┬─────┘
        │            │            │
        └────────────┼────────────┘
                     ▼
              ┌──────────────┐
              │ Action Store │ (PostgreSQL)
              └──────┬───────┘
                     ▼
         ┌───────────────────────┐
         │  Policy Evaluator     │
         │  - Constraint engine  │
         │  - Rate limiter       │
         │  - Temporal rules     │
         └───────┬───────────────┘
                 ▼
         ┌──────────────────┐
         │ Approval Manager │
         │ - Notifier       │
         │ - Signer queue   │
         └────────┬─────────┘
                  ▼
        ┌──────────────────────┐
        │ Credential Broker    │
        │ - Fetch from vault   │
        │ - Inject            │
        │ - Cleanup            │
        └────────┬─────────────┘
                 ▼
         ┌──────────────────┐
         │ Action Executor  │
         │ - Mediation      │
         │ - External call  │
         │ - Retry logic    │
         └────────┬─────────┘
                  ▼
         ┌──────────────────┐
         │ Evidence Gen     │
         │ - Hash result    │
         │ - Sign           │
         │ - Record         │
         └────────┬─────────┘
                  ▼
        ┌──────────────────────┐
        │ External Attestation │
        │ (optional)           │
        └──────────────────────┘
```

## Key Components

### HTTP/gRPC Server

Accepts incoming requests from agents. Handles:
- Connection pooling
- TLS termination
- Request routing
- Response serialization

Framework: Express.js (Node.js) or FastAPI (Python)

### Request Router

Routes incoming requests to appropriate handlers based on:
- HTTP method and path
- gRPC service and method
- Content type

### Request Validator

Validates incoming action proposals:
- Required fields present
- Field types correct
- Field values within bounds
- Signature verification

Fails fast: invalid requests rejected with clear error messages.

### Request Deduper

Checks for duplicate requests using request hash (SHA256 of action intent).

If duplicate found:
- Return cached result instead of reprocessing
- Prevents double-execution due to network retries

### Action Store

Stores all actions in PostgreSQL:

```sql
CREATE TABLE actions (
  id UUID PRIMARY KEY,
  signer_wallet VARCHAR(255),
  action_type VARCHAR(255),
  target JSONB,
  status VARCHAR(50),
  contract_id VARCHAR(255),
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  approval_count INT,
  outcome VARCHAR(50),
  error_message TEXT
);
```

Indexes on:
- `id` (primary)
- `signer_wallet` + `status` (queries by agent)
- `created_at` (time range queries)
- `status` (approval workflows)

### Policy Evaluator

Evaluates all constraints from the contract:

```python
def evaluate_policy(action, contract):
    for constraint in contract.constraints:
        if not eval_constraint(constraint, action):
            return REJECT
    return ALLOW
```

Constraint evaluation:
- **Temporal:** Check current time against start/end, day list
- **Rate limit:** Query counters, check if exceeded
- **Dollar limit:** Query sums, check if exceeded
- **Category:** Extract field from action, compare
- **Delegation:** Check signer's delegation chain
- **Webhook:** Make HTTP call, check response

Short-circuit: Stop on first failure.

### Approval Manager

Manages the approval workflow:

1. Look up required signers from contract
2. Send notifications to each signer (email, Slack, etc.)
3. Wait for approvals or timeout
4. Verify signatures
5. Move action to Approved state

Stores approvals in database:

```sql
CREATE TABLE approvals (
  id UUID PRIMARY KEY,
  action_id UUID,
  signer VARCHAR(255),
  signature TEXT,
  timestamp TIMESTAMP,
  verified BOOLEAN
);
```

### Credential Broker

Fetches and injects credentials:

1. Look up credential key in contract
2. Call vault backend (HashiCorp Vault, AWS Secrets Manager, etc.)
3. Inject into process environment or socket
4. Set TTL timer
5. On execution complete: revoke/clean up

Integrations:
- HashiCorp Vault
- AWS Secrets Manager
- Azure Key Vault
- Generic HTTPS endpoint

### Action Executor

Executes the approved action on the target system:

1. Look up mediation function for action type
2. Build system call (HTTP, SQL, SSH, etc.)
3. Set timeout (default 300s)
4. Execute call
5. Capture result
6. Determine outcome (success, failure, partial, etc.)

Supports:
- HTTP/REST APIs
- SQL databases
- SSH commands
- gRPC services
- Custom protocols via plugins

### Evidence Generator

Creates evidence after execution:

1. Hash the result (SHA256)
2. Populate 18-field evidence object
3. Compute evidence hash
4. Sign with gateway key
5. Record in audit log

Evidence stored in:

```sql
CREATE TABLE evidence (
  evidence_id UUID PRIMARY KEY,
  action_id UUID,
  timestamp TIMESTAMP,
  action_type VARCHAR(255),
  outcome VARCHAR(50),
  result_hash VARCHAR(64),
  signature TEXT,
  attestation_anchor TEXT,
  created_at TIMESTAMP
);
```

### External Attestation

(Optional) Attests evidence to external backend:

1. Serialize evidence to JSON
2. Compute hash (SHA256)
3. Call attestation backend API
4. Submit evidence and hash
5. Wait for attestation confirmation
6. Record attestation anchor ID in evidence

Supports:
- Pluggable attestation backends
- S3 Glacier / immutable cloud storage
- Managed attestation services
- Internal append-only audit logs


## Data Flow: Complete Example

```
Agent proposes: DELETE user 12345

1. HTTP POST /api/v1/actions/propose
   → RequestRouter receives request
   → RequestValidator checks format, signature
   → RequestDeduper checks for duplicates

2. Action stored in action_store
   Status: Proposed

3. ContractLookup queries for user.delete contracts

4. PolicyEvaluator checks:
   - Environment constraint: environment == staging ✓
   - Rate limit: 25/100 ✓
   - Time of day: 14:35 in 09:00-17:00 ✓
   → All pass, continue

5. ApprovalManager:
   - Looks up required signers: alice@acme.com, bob@acme.com
   - Sends notification to alice (email)
   - Waits...
   - Receives approval from alice at 14:35:10
   - Sends notification to bob
   - Receives approval from bob at 14:35:20
   - Verifies signatures ✓
   → Action status: Approved

6. Agent calls GET /api/v1/actions/action-123
   → Returns status: Approved

7. Agent calls POST /api/v1/actions/action-123/execute
   → CredentialBroker fetches DB password from vault
   → Injects into process via Unix socket
   → ActionExecutor calls: DELETE /api/users/12345
   → Result: HTTP 200
   → Outcome: success

8. EvidenceGenerator:
   - Creates evidence object with 18 fields
   - Hashes result
   - Computes evidence hash
   - Signs with gateway key
   → Evidence stored in evidence table

9. External Attestation (optional):
   - Submits evidence to attestation backend
   - Gets anchor ID: anchor-xyz123
   - Waits for attestation confirmation
   → Anchor recorded in evidence

10. Return to agent: status=attested, outcome=success
```

## Fault Tolerance

### Failures in Policy Evaluation
- Constraint fails → Reject immediately
- Webhook timeout → Reject immediately
- Webhook error → Retry with exponential backoff, then reject

### Failures in Approval
- Signer doesn't respond → Timeout after 1 hour
- Invalid signature → Reject
- Revoked key → Reject

### Failures in Credential Injection
- Vault down → Fail-closed, abort execution
- Credential expired → Fail-closed, abort execution
- TTL exceeded → Fail-closed, abort execution

### Failures in Execution
- Network timeout → Fail, mark as retryable
- Target system error → Fail, may be retryable
- Invalid credentials → Fail, non-retryable
- Idempotency conflict → Return cached result

### Failures in Evidence Generation
- Database down → Retry with backoff
- Signing key unavailable → Alert operators, retry
- Still record partial evidence

### Failures in External Attestation
- Backend down → Retry with exponential backoff
- Attestation rate limit → Retry with backoff
- Attestation fails → Log failure, don't fail action

## Performance Optimizations

### Caching

- **Contract cache:** In-memory cache of loaded contracts, invalidated hourly
- **Signer key cache:** Cache of public keys, invalidated on key rotation
- **Mediation function cache:** In-memory cache of action→operation mappings

### Rate Limiting

- **Per-agent rate limit:** 1000 req/sec
- **Per-action-type rate limit:** 10000 req/sec
- **Global rate limit:** 50000 req/sec
- Implemented via token bucket algorithm

### Database Optimization

- **Indexes on hot columns:** signer_wallet, status, created_at
- **Connection pooling:** Max 100 connections
- **Query optimization:** Use prepared statements
- **Partitioning:** Actions table partitioned by date

### Async Processing

- **Policy evaluation:** Sync (fast path)
- **Approval notifications:** Async (fire and forget)
- **Evidence generation:** Sync but non-blocking
- **External attestation:** Async (background job)

## Monitoring

Gateway exposes these metrics:

```
atp_requests_total (counter, by endpoint)
atp_request_duration_seconds (histogram)
atp_action_status (gauge, by status)
atp_policy_rejections (counter, by reason)
atp_approval_wait_seconds (histogram)
atp_execution_duration_seconds (histogram)
atp_database_connections (gauge)
atp_cache_hits (counter, by cache type)
atp_errors_total (counter, by type)
```

Logs: Structured JSON logs, including:
- Timestamp, log level
- Component name
- Action ID, signer wallet
- Status change, reason
- Latency metrics

## Security Properties

- **Fail-closed:** If anything is uncertain, reject
- **Cryptographic signing:** COSE signatures on evidence, contracts, approvals
- **Audit trail:** Append-only log, no deletions
- **Credential hygiene:** Never stored, fetched at execution time
- **Rate limiting:** Prevent brute force and DoS
- **Key rotation:** Signing keys rotated every 30 days
- **Network isolation:** TLS for all traffic, no plaintext
- **Access control:** Agents identified by wallet, no password-based auth

## Next Steps

- [Deployment](./deployment.md) — How to run the gateway
- [Specification](../spec/overview.md) — Protocol details
