---
sidebar_position: 3
---

# Gateway Deployment

How to deploy and operate the ATP gateway in development, staging, and production.

## Prerequisites

- Node.js 18+ or Python 3.8+
- PostgreSQL 13+
- Docker (optional but recommended)
- Kubernetes (optional, for multi-instance deployments)

## Quick Start (Docker)

```bash
# Clone repository
git clone https://github.com/ATP-Protocol/atp-gateway.git
cd atp-gateway

# Build Docker image
docker build -t atp-gateway:latest .

# Run gateway
docker run -d \
  --name atp-gateway \
  -p 8080:8080 \
  -e DATABASE_URL=postgres://user:pass@postgres:5432/atp \
  -e GATEWAY_PORT=8080 \
  -e LOG_LEVEL=info \
  atp-gateway:latest

# Test gateway health
curl http://localhost:8080/health
# Returns: {"status": "healthy", "version": "1.0.0"}
```

## Configuration

### Environment Variables

Required:
```bash
DATABASE_URL=postgres://user:pass@localhost:5432/atp
GATEWAY_PORT=8080
```

Optional:
```bash
LOG_LEVEL=info                          # debug, info, warn, error
NODE_ENV=production                     # or development, staging
CREDENTIAL_BROKER_URL=http://localhost:8081
APPROVAL_NOTIFIER=email
APPROVAL_EMAIL_FROM=noreply@atp.example.com
BLOCKCHAIN_ENABLED=true
BLOCKCHAIN_CHAIN=ethereum
BLOCKCHAIN_RPC=https://mainnet.infura.io/v3/...
BLOCKCHAIN_CONTRACT_ADDRESS=0x...
```

### Config File (YAML)

```yaml
# gateway-config.yaml
gateway:
  port: 8080
  log_level: info
  request_timeout_ms: 30000
  
database:
  url: postgres://user:pass@localhost:5432/atp
  max_connections: 100
  ssl_mode: require
  
contract_store:
  backend: postgres
  
credential_broker:
  url: http://localhost:8081
  timeout_ms: 5000
  retry_count: 3
  
approval_service:
  notification_method: email
  email_provider: sendgrid
  api_key: [REDACTED]
  timeout_seconds: 3600
  
blockchain:
  enabled: true
  chain: ethereum
  rpc_url: https://mainnet.infura.io/v3/...
  contract_address: 0x...
  gas_limit: 50000
  
audit_log:
  backend: postgres
  retention_days: 2555
```

## Local Development

### 1. Set up database

```bash
# Start PostgreSQL
docker run -d \
  --name atp-postgres \
  -e POSTGRES_USER=atp \
  -e POSTGRES_PASSWORD=dev \
  -e POSTGRES_DB=atp \
  -p 5432:5432 \
  postgres:15

# Create tables
npm run db:migrate
```

### 2. Start gateway

```bash
# Install dependencies
npm install

# Set environment
export DATABASE_URL=postgres://atp:dev@localhost:5432/atp
export GATEWAY_PORT=8080
export LOG_LEVEL=debug

# Start server
npm run start
```

### 3. Test

```bash
# Health check
curl http://localhost:8080/health

# Propose an action
curl -X POST http://localhost:8080/api/v1/actions/propose \
  -H "Content-Type: application/json" \
  -d '{
    "type": "user.delete",
    "target": {"user_id": "12345"},
    "metadata": {}
  }'
```

## Staging Deployment (Docker Compose)

```yaml
# docker-compose.yml
version: '3.8'

services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_USER: atp
      POSTGRES_PASSWORD: staging-pass
      POSTGRES_DB: atp
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  atp-gateway:
    build: .
    ports:
      - "8080:8080"
    environment:
      DATABASE_URL: postgres://atp:staging-pass@postgres:5432/atp
      GATEWAY_PORT: 8080
      LOG_LEVEL: info
    depends_on:
      - postgres
    volumes:
      - ./config.yaml:/app/config.yaml

  credential-broker:
    image: atp-credential-broker:latest
    ports:
      - "8081:8081"
    environment:
      VAULT_ADDR: http://vault:8200

volumes:
  postgres_data:
```

Start:
```bash
docker-compose up -d
```

## Production Deployment (Kubernetes)

### 1. Create Kubernetes namespace

```bash
kubectl create namespace atp
```

### 2. Create PostgreSQL (via CloudSQL or Managed Postgres)

```yaml
# postgres-secret.yaml
apiVersion: v1
kind: Secret
metadata:
  name: postgres-credentials
  namespace: atp
type: Opaque
stringData:
  DATABASE_URL: postgres://atp:$(POSTGRES_PASSWORD)@postgres.c.PROJECT.internal:5432/atp
```

### 3. Deploy gateway

```yaml
# gateway-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: atp-gateway
  namespace: atp
spec:
  replicas: 5
  selector:
    matchLabels:
      app: atp-gateway
  template:
    metadata:
      labels:
        app: atp-gateway
    spec:
      containers:
      - name: atp-gateway
        image: ATP-Protocol/atp-gateway:1.0.0
        ports:
        - containerPort: 8080
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: postgres-credentials
              key: DATABASE_URL
        - name: GATEWAY_PORT
          value: "8080"
        - name: LOG_LEVEL
          value: "info"
        - name: BLOCKCHAIN_ENABLED
          value: "true"
        - name: BLOCKCHAIN_RPC
          valueFrom:
            secretKeyRef:
              name: blockchain-credentials
              key: RPC_URL
        resources:
          requests:
            cpu: 500m
            memory: 512Mi
          limits:
            cpu: 2000m
            memory: 2Gi
        livenessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 10
          periodSeconds: 5
```

Deploy:
```bash
kubectl apply -f gateway-deployment.yaml
```

### 4. Create service

```yaml
# gateway-service.yaml
apiVersion: v1
kind: Service
metadata:
  name: atp-gateway
  namespace: atp
spec:
  selector:
    app: atp-gateway
  ports:
  - protocol: TCP
    port: 8080
    targetPort: 8080
  type: ClusterIP
```

### 5. Configure ingress

```yaml
# gateway-ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: atp-gateway-ingress
  namespace: atp
  annotations:
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
spec:
  ingressClassName: nginx
  tls:
  - hosts:
    - atp.example.com
    secretName: atp-gateway-tls
  rules:
  - host: atp.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: atp-gateway
            port:
              number: 8080
```

## Database Setup

### Initialize Schema

```bash
npm run db:migrate
```

Or manually:

```sql
-- Create actions table
CREATE TABLE actions (
  id UUID PRIMARY KEY,
  signer_wallet VARCHAR(255) NOT NULL,
  action_type VARCHAR(255) NOT NULL,
  target JSONB NOT NULL,
  status VARCHAR(50) NOT NULL,
  contract_id VARCHAR(255),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  approval_count INT DEFAULT 0,
  outcome VARCHAR(50),
  error_message TEXT
);

CREATE INDEX idx_actions_signer_status ON actions(signer_wallet, status);
CREATE INDEX idx_actions_created_at ON actions(created_at);
CREATE INDEX idx_actions_type ON actions(action_type);

-- Create approvals table
CREATE TABLE approvals (
  id UUID PRIMARY KEY,
  action_id UUID NOT NULL REFERENCES actions(id),
  signer VARCHAR(255) NOT NULL,
  signature TEXT NOT NULL,
  timestamp TIMESTAMP NOT NULL,
  verified BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX idx_approvals_action_id ON approvals(action_id);

-- Create evidence table
CREATE TABLE evidence (
  evidence_id UUID PRIMARY KEY,
  action_id UUID NOT NULL REFERENCES actions(id),
  timestamp TIMESTAMP NOT NULL,
  action_type VARCHAR(255) NOT NULL,
  outcome VARCHAR(50) NOT NULL,
  result_hash VARCHAR(64),
  signature TEXT NOT NULL,
  blockchain_tx VARCHAR(255),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_evidence_action_id ON evidence(action_id);
CREATE INDEX idx_evidence_created_at ON evidence(created_at);
```

### Backup Strategy

Daily backups using `pg_dump`:

```bash
#!/bin/bash
# backup.sh
BACKUP_DIR=/backups
TIMESTAMP=$(date +%Y-%m-%d_%H-%M-%S)
BACKUP_FILE=$BACKUP_DIR/atp-db-$TIMESTAMP.sql.gz

pg_dump $DATABASE_URL | gzip > $BACKUP_FILE

# Keep 30 days of backups
find $BACKUP_DIR -name "atp-db-*.sql.gz" -mtime +30 -delete

# Upload to S3
aws s3 cp $BACKUP_FILE s3://atp-backups/
```

Schedule with cron:
```
0 2 * * * /scripts/backup.sh
```

## Monitoring & Observability

### Prometheus Metrics

```yaml
# prometheus.yaml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'atp-gateway'
    static_configs:
      - targets: ['localhost:9090']
    metrics_path: '/metrics'
```

### Logging

All logs sent to ELK stack or Datadog:

```bash
# Enable structured logging
export LOG_FORMAT=json
export LOG_DESTINATION=stdout
```

Example log entry:
```json
{
  "timestamp": "2026-03-15T14:35:00Z",
  "level": "info",
  "component": "action_executor",
  "action_id": "action-12345",
  "signer": "agent-001",
  "event": "action_executed",
  "outcome": "success",
  "duration_ms": 245
}
```

### Alerting

Configure alerts for:
- Gateway restart
- Database connection failures
- Approval timeout spikes
- Policy rejection spikes
- Execution failure spikes
- Blockchain anchor failures

Example Prometheus alert:

```yaml
groups:
  - name: atp-gateway
    rules:
      - alert: GatewayDown
        expr: up{job="atp-gateway"} == 0
        for: 2m
        annotations:
          summary: "ATP Gateway is down"

      - alert: HighErrorRate
        expr: rate(atp_errors_total[5m]) > 0.01
        for: 5m
        annotations:
          summary: "ATP Gateway error rate > 1%"
```

## Maintenance

### Regular Tasks

- **Daily:** Check logs for errors, monitor alert queue
- **Weekly:** Review audit logs for suspicious patterns
- **Monthly:** Review performance metrics, optimize slow queries
- **Quarterly:** Security audit, penetration testing
- **Annually:** Disaster recovery drill, key rotation

### Updates

1. Test update in staging
2. Create maintenance window (announce 24h in advance)
3. Deploy to 1 instance, monitor
4. If ok, deploy to remaining instances
5. Run smoke tests
6. Announce completion

## Troubleshooting

### Gateway not starting

```bash
# Check logs
docker logs atp-gateway

# Common issues:
# - Database connection failed: Check DATABASE_URL and network
# - Port already in use: Change GATEWAY_PORT or kill existing process
# - Missing credentials file: Check AWS credentials, GCP keyfile
```

### High latency

```bash
# Check database connection pool
SELECT count(*) FROM pg_stat_activity;

# If many idle connections:
DISCARD CONNECTIONS;

# Review slow queries
SELECT * FROM pg_stat_statements ORDER BY mean_time DESC LIMIT 10;
```

### Approval notifications not sent

```bash
# Check credential broker
curl http://credential-broker:8081/health

# Check email provider (SendGrid, etc.)
curl -H "Authorization: Bearer $SENDGRID_API_KEY" \
  https://api.sendgrid.com/v3/mail/validate
```

## Next Steps

- [Overview](./overview.md) — Architecture and concepts
- [Quick Start](../quick-start.md) — Set up ATP in 5 minutes
- [Security](../spec/security.md) — Security best practices
