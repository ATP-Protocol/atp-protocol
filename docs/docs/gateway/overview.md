---
sidebar_position: 1
---

# Gateway Overview

The **ATP Gateway** is the core runtime that evaluates contracts, manages approvals, executes actions, and generates evidence. This section explains the gateway architecture, the 8-step execution pipeline, and how to deploy it.

## What is the Gateway?

The gateway is a service that:

1. **Receives action proposals** from agents
2. **Looks up contracts** that govern those actions
3. **Evaluates policies** (constraints, rate limits, time-of-day rules)
4. **Manages approvals** (waits for required signers)
5. **Executes actions** on target systems
6. **Generates evidence** of execution
7. **Records audit trails** in an append-only log
8. **Anchors proof** to blockchain (optional)

It sits between your agents and your systems, acting as a trust and accountability layer.

## Architecture

```
┌─────────────┐
│   Agent     │
└──────┬──────┘
       │ HTTP/gRPC
       ▼
┌──────────────────────────────────┐
│  ATP Gateway                     │
│  ┌──────────────────────────────┐│
│  │ 1. Action Intake & Validation││
│  └──────────────────────────────┘│
│  ┌──────────────────────────────┐│
│  │ 2. Contract Lookup           ││
│  └──────────────────────────────┘│
│  ┌──────────────────────────────┐│
│  │ 3. Policy Evaluation         ││
│  └──────────────────────────────┘│
│  ┌──────────────────────────────┐│
│  │ 4. Approval Management       ││
│  └──────────────────────────────┘│
│  ┌──────────────────────────────┐│
│  │ 5. Credential Brokerage      ││
│  └──────────────────────────────┘│
│  ┌──────────────────────────────┐│
│  │ 6. Action Execution          ││
│  └──────────────────────────────┘│
│  ┌──────────────────────────────┐│
│  │ 7. Evidence Generation       ││
│  └──────────────────────────────┘│
│  ┌──────────────────────────────┐│
│  │ 8. Blockchain Anchoring      ││
│  └──────────────────────────────┘│
└──────────────────────────────────┘
       │
       ├─► Credential Broker
       ├─► Audit Log Database
       ├─► Contract Store
       ├─► Approval Service
       ├─► Target Systems (APIs, databases, etc.)
       └─► Blockchain (optional)
```

## 8-Step Execution Pipeline

### Step 1: Action Intake & Validation

**Input:** Action from agent
```json
{
  "type": "user.delete",
  "target": {"user_id": "12345"},
  "metadata": {...}
}
```

**Validation:**
- Action type is non-empty
- Target is provided
- All required fields present
- Action size < 1MB

**Output:** Validated action with ID, timestamp, signer

### Step 2: Contract Lookup

**Input:** Action type
**Process:** Query contract store for contracts matching `action.type`
**Output:** List of matching contracts (usually 1)
**On failure:** Escalate to human review

### Step 3: Policy Evaluation

**Input:** Action + contract constraints
**Process:** Check all constraints (temporal, quantitative, categorical, delegation, rate limiting)
**Output:** ALLOW or REJECT decision
**On failure:** Reject action, log reason

### Step 4: Approval Management

**Input:** Action + contract approval requirements
**Process:** Wait for required signers to approve
**Output:** List of signatures or timeout
**On failure:** Escalate or reject

### Step 5: Credential Brokerage

**Input:** Action + contract credential requirements
**Process:** Fetch credentials from broker, inject into execution context
**Output:** Injected credentials (or failure)
**On failure:** Abort execution (fail-closed)

### Step 6: Action Execution

**Input:** Approved, policy-compliant action with injected credentials
**Process:** Call target system, capture result
**Output:** Execution result (success, failure, etc.)
**On failure:** Log failure, clean up credentials

### Step 7: Evidence Generation

**Input:** Execution result
**Process:** Create 18-field evidence object, sign it
**Output:** Signed evidence
**On failure:** Still record partial evidence

### Step 8: Blockchain Anchoring

**Input:** Signed evidence
**Process:** (Optional) Submit evidence hash to blockchain
**Output:** Blockchain transaction hash
**On failure:** Log failure but don't fail action

## Deployment Models

### Single-Instance (Development)

One gateway instance, single database, suitable for testing.

```yaml
gateway:
  instances: 1
  database: postgres://localhost/atp
  contract_store: filesystem
  audit_log: postgres
  credential_broker: http://localhost:8081
```

### High-Availability (Production)

Multiple gateway instances behind a load balancer, replicated database.

```yaml
gateway:
  instances: 5
  database: postgres://primary:5432,replica1:5432,replica2:5432
  contract_store: s3://atp-contracts
  audit_log: postgres (with replication)
  credential_broker: http://broker-1:8081,http://broker-2:8081
  load_balancer: nginx
```

### Distributed (Multi-Region)

Gateway deployed in multiple regions, audit logs replicated.

```yaml
regions:
  us-east:
    gateway_instances: 3
    database: postgres://us-east-primary:5432
    
  us-west:
    gateway_instances: 3
    database: postgres://us-west-primary:5432
    
  eu-west:
    gateway_instances: 3
    database: postgres://eu-west-primary:5432
    
audit_log: 
  primary: us-east
  replicas: [us-west, eu-west]
```

## Performance Characteristics

| Operation | Latency | Throughput |
|-----------|---------|------------|
| Action proposal | 10-50ms | 1000+ req/sec |
| Contract lookup | 1-5ms | 10000+ req/sec |
| Policy evaluation | 5-20ms | 5000+ req/sec |
| Approval wait | 5-60sec | (human-limited) |
| Credential injection | 10-100ms | 1000+ req/sec |
| Action execution | 100ms-5sec | (target-dependent) |
| Evidence generation | 10-50ms | 1000+ req/sec |
| Blockchain anchor | 10-30sec | 100+ tx/sec |

## Observability

The gateway exposes metrics for monitoring:

```
atp_action_proposed (counter)
atp_action_approved (counter)
atp_action_executed (counter)
atp_action_failed (counter)
atp_policy_evaluation_time (histogram)
atp_execution_time (histogram)
atp_approval_wait_time (histogram)
atp_evidence_generation_time (histogram)
atp_contract_lookup_time (histogram)
atp_credential_injection_time (histogram)
atp_blockchain_anchor_time (histogram)
atp_audit_log_writes (counter)
atp_gateway_errors (counter)
```

Example Prometheus config:

```yaml
scrape_configs:
  - job_name: 'atp-gateway'
    static_configs:
      - targets: ['localhost:9090']
    metrics_path: '/metrics'
```

## Security Considerations

The gateway must be:

1. **Isolated** — Not accessible from the internet directly; behind a firewall
2. **Encrypted** — TLS for all inbound/outbound traffic
3. **Audited** — All gateway logs sent to remote syslog
4. **Rate-limited** — Prevent brute force attacks
5. **Monitored** — Alert on suspicious patterns
6. **Backed up** — Regular database backups, encrypted at rest
7. **Updated** — Security patches applied within 24 hours

See [Security Considerations](../spec/security.md) for detailed threat model.

## Configuration

Configure the gateway via environment variables or a config file:

```yaml
# config.yaml
gateway:
  port: 8080
  log_level: info
  
database:
  url: postgres://user:pass@localhost:5432/atp
  max_connections: 100
  
contract_store:
  backend: postgres  # or s3, filesystem
  
credential_broker:
  url: http://localhost:8081
  timeout_ms: 5000
  
approval_service:
  notification_method: email
  email_provider: sendgrid
  
blockchain:
  enabled: true
  chain: ethereum
  rpc_url: https://mainnet.infura.io/v3/...
  contract_address: 0x...
  
audit_log:
  backend: postgres
  retention_days: 2555
```

## API Surface

The gateway exposes these endpoints:

```
POST   /api/v1/actions/propose
GET    /api/v1/actions/{action_id}
GET    /api/v1/actions
POST   /api/v1/actions/{action_id}/approve
POST   /api/v1/actions/{action_id}/execute
GET    /api/v1/evidence/{action_id}
GET    /api/v1/contracts
POST   /api/v1/contracts
GET    /api/v1/audit?filter=...
GET    /api/v1/health
GET    /metrics
```

See [Gateway Deployment](./deployment.md) for full API reference.

## Next Steps

- **[Architecture](./architecture.md)** — Deep dive into gateway internals
- **[Deployment](./deployment.md)** — How to run the gateway
- **[Quick Start](../quick-start.md)** — Set up a local gateway in 5 minutes
