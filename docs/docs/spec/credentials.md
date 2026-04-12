---
sidebar_position: 6
---

# Section 8: Credential Brokerage

The **Credential Broker** is how agents securely obtain credentials (API keys, database passwords, cloud tokens) at execution time without storing them. This section defines the broker architecture, injection methods, and fail-closed enforcement.

## Problem Statement

Agents need credentials to access external systems, but storing credentials in agents is dangerous:

1. **Theft risk** — If the agent is compromised, credentials are stolen
2. **Rotation pain** — Rotating credentials requires updating the agent
3. **Audit gap** — No record of when/how credentials were used
4. **Scope creep** — Agent gets credentials for more than it needs

The Credential Broker solves this by:
- Fetching credentials at execution time
- Injecting them into the agent's execution context
- Immediately cleaning up (credentials never sit on disk)
- Recording every credential access in audit logs

## Broker Architecture

```
┌──────────────────────┐
│   Agent             │
│  (running action)   │
└──────────┬───────────┘
           │ "I need DB password"
           ▼
┌──────────────────────────────┐
│ ATP Credential Broker        │
│  1. Verify action approval   │
│  2. Look up credential key   │
│  3. Fetch from vault         │
│  4. Inject into process      │
│  5. Log access               │
└──────────────────────────────┘
           │
           ▼
┌────────────────────────────────┐
│ Credential Vault               │
│ (HashiCorp Vault, AWS Secrets, │
│  Azure Key Vault, etc.)        │
└────────────────────────────────┘
```

## Credential Specification

In a contract, specify which credentials are needed:

```json
"credentials": {
  "database": {
    "type": "postgres",
    "broker_reference": "prod-db-credentials",
    "required": true,
    "ttl": 300
  },
  "cloud": {
    "type": "aws",
    "broker_reference": "aws-admin-role",
    "assume_role_arn": "arn:aws:iam::123456789:role/admin",
    "ttl": 3600
  },
  "github": {
    "type": "github_token",
    "broker_reference": "github-api-key",
    "required": false,
    "ttl": 900
  }
}
```

**Fields:**
- **type** — Credential type (postgres, mysql, aws, github_token, generic_secret)
- **broker_reference** — How to look up the credential in the vault
- **required** (optional, default true) — Must the credential exist?
- **ttl** (optional, default 300) — Time-to-live in seconds; credential is cleaned up after this
- **assume_role_arn** (AWS only) — Optional STS assume role ARN

## Injection Methods

ATP supports 5 ways to inject credentials:

### Method 1: Environment Variables

Credentials are set as environment variables in the agent's process.

```bash
export DB_PASSWORD="secret123"
export AWS_ACCESS_KEY_ID="AKIA..."
```

**Advantages:** Simple, works everywhere
**Disadvantages:** Visible in process listings, can be leaked to child processes
**Use case:** Local development, testing

### Method 2: Mounted Filesystem

Credentials are written to a temporary file, mounted into the agent's filesystem, then cleaned up.

```
/tmp/atp-creds/database.txt (read-only)
/tmp/atp-creds/aws-credentials.json (read-only)
```

**Advantages:** Fine-grained file permissions, child processes don't inherit
**Disadvantages:** Requires filesystem access
**Use case:** Containerized agents, Kubernetes pods

### Method 3: Unix Domain Socket

Credentials are served over a Unix socket. Agent makes a local HTTP call to request credentials.

```
GET /creds/database
GET /creds/aws
```

**Advantages:** Credentials never written to disk, per-request access control
**Disadvantages:** Requires socket support, adds latency
**Use case:** High-security deployments, credential logging

### Method 4: In-Process / Memory

(Not recommended but supported for compatibility) Credentials passed directly as function parameters.

**Disadvantages:** Credentials visible in memory, risk of leakage
**Use case:** Local testing only

### Method 5: Webhook / API

Agent makes an authenticated call to a broker API endpoint to request credentials.

```
POST /broker/request-credential
{
  "action_id": "action-12345",
  "credential_key": "database"
}
Response:
{
  "credential": "secret123",
  "ttl": 300,
  "token": "broker-token-xyz"
}
```

**Advantages:** Central control, fine-grained access logs
**Disadvantages:** Network latency, broker availability risk
**Use case:** Multi-tenant environments, compliance requirements

## Fail-Closed Enforcement

ATP enforces a **fail-closed** model: if credential injection fails, the action does not execute.

```
1. Action approved and moving to execution
2. ATP attempts credential injection
3. If credential not found:
   → ABORT execution
   → Mark action as exec_failed
   → Log failure with reason
   → Alert operators
   → Do NOT fall back to some default
4. If credential injection partially fails (1 of 3 needed):
   → ABORT ALL injection
   → Clean up any injected credentials
   → ABORT execution
```

This is a security requirement. Partial credential injection could allow agents to act with incomplete privileges and cause confusion or bypass controls.

## Key Rotation

When credentials rotate in the vault, ATP automatically uses the new credentials for subsequent actions. No manual intervention needed.

```timeline
Old credential active
↓ (credential rotates in vault)
New credential active in vault
↓ (next action proposed)
Action gets new credential
```

For actions that are already Approved but not yet Executing:
- **If not yet executing:** New credential injected at execution time
- **If executing:** Continue with old credential (don't interrupt)
- **If already executed:** Old credential was used (audit log shows which)

## Credential Audit Logging

Every credential access is logged:

```json
{
  "timestamp": "2026-03-15T14:35:00Z",
  "action_id": "action-12345",
  "signer": "agent-001",
  "credential_key": "database",
  "status": "success",
  "injection_method": "unix_socket",
  "ttl_requested": 300,
  "ttl_granted": 300,
  "vault_source": "hashicorp-vault",
  "ip_address": "10.0.0.5"
}
```

This log is immutable and retained for compliance (default 7 years).

## Broker Configuration

Configure the credential broker in ATP deployment:

```yaml
credential_broker:
  enabled: true
  vault_backend: "hashicorp-vault"
  vault_address: "https://vault.internal:8200"
  vault_token: "[REDACTED]"
  
  injection_methods:
    - name: "unix_socket"
      enabled: true
      socket_path: "/tmp/atp-broker.sock"
    - name: "environment"
      enabled: true
      prefix: "ATP_CRED_"
    - name: "filesystem"
      enabled: true
      mount_path: "/tmp/atp-creds"
      permissions: "0400"
  
  key_rotation:
    enabled: true
    check_interval: 3600  # Check for rotated keys every hour
  
  audit_log:
    enabled: true
    sink: "postgres"  # or s3, syslog, etc.
    retention_days: 2555  # ~7 years
```

## SDK Usage

Request credentials in your action:

```typescript
import { ATP } from '@atp-protocol/sdk';

const atp = new ATP({ /* ... */ });

// When executing an action with credential requirements
const action = await atp.actions.propose({
  type: 'database.backup',
  target: { database: 'users' },
  credentials: {
    database: {
      key: 'prod-db-password',
      injection_method: 'unix_socket'
    }
  }
});

// ATP will:
// 1. Validate the action
// 2. Request approval
// 3. At execution time:
//    - Fetch credential from vault
//    - Inject via Unix socket
//    - Execute backup
//    - Log credential access
//    - Clean up

// Get credential access logs
const logs = await atp.credentials.auditLogs({
  action_id: action.id,
  limit: 10
});
logs.forEach(log => {
  console.log(`${log.credential_key}: ${log.status}`);
});
```

## Compliance & Security

### PCI-DSS
- Credentials are never written to persistent storage
- Fail-closed enforcement prevents incomplete privilege escalation
- Audit logs retained for 7 years

### SOC 2 Type II
- Credential access is logged and monitored
- Credentials are time-limited (TTL)
- Regular key rotation supported

### HIPAA
- Credentials for PHI systems are stored in HIPAA-compliant vaults only
- Audit logs are encrypted at rest

### GDPR
- Credential access logs are retained only as long as necessary
- Credential access can be correlated to user actions for data subject access requests

## Threat Model

The Credential Broker is vulnerable to:

1. **Broker compromise** — If the broker is hacked, credentials are stolen
   - **Mitigation:** Isolate broker, TLS, network segmentation, monitor access

2. **Vault compromise** — If the credential vault is hacked, all credentials stolen
   - **Mitigation:** Use managed services (AWS Secrets Manager, HashiCorp Cloud), enable MFA, audit all access

3. **Credential timing attack** — Attacker observes which credentials are accessed when
   - **Mitigation:** Constant-time injection, masking, audit log encryption

4. **Child process leakage** — Child spawned by agent sees environment variables
   - **Mitigation:** Use Unix socket or filesystem methods instead of environment variables

5. **Memory scraping** — Process dump exposes credentials in memory
   - **Mitigation:** Clear memory after use, use hardware security modules for highly sensitive credentials

## Best Practices

1. **Use Unix socket or filesystem** — More secure than environment variables
2. **Set reasonable TTLs** — 300-900 seconds typical, never more than 3600
3. **Rotate credentials regularly** — Every 30-90 days
4. **Monitor credential access** — Alert on unusual patterns
5. **Use managed vaults** — AWS Secrets Manager, HashiCorp Cloud, Azure Key Vault
6. **Restrict credential scope** — Database user with only SELECT rights, not DROP
7. **Test credential failure** — Make sure agents handle missing credentials gracefully

## Next Steps

- [Execution Semantics](./execution.md) — Learn how actions execute with injected credentials
- [Evidence & Attestation](./evidence.md) — See how credential access is audited
