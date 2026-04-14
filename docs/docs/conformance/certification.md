---
sidebar_position: 4
---

# Certification

How to officially certify your ATP implementation and join the certified implementations registry.

## Certification Process

The certification process has these steps:

```
1. Test Your Implementation
   ↓
2. Generate Test Report
   ↓
3. Submit to Registry
   ↓
4. Security Audit (Levels 3+)
   ↓
5. Code Review by ATP Maintainers
   ↓
6. Certification Issued
```

**Typical timeline:** 1-4 weeks depending on level

## Level 1: Basic Certification

### Requirements

1. Run conformance test suite at Level 1
2. All 47 tests pass
3. Submit results to registry

### Steps

1. **Run tests:**
   ```bash
   npm run test:basic -- --output=results.json
   ```

2. **Review results:**
   ```bash
   cat results.json
   # Should show: "stats": { "passes": 47, "failures": 0 }
   ```

3. **Submit:**
   ```bash
   curl -X POST https://registry.atp-protocol.org/api/v1/certifications \
     -H "Content-Type: application/json" \
     -d @submission.json
   ```

   Where `submission.json`:
   ```json
   {
     "level": "basic",
     "implementation_name": "My ATP Gateway v1.0",
     "implementation_repo": "https://github.com/myorg/my-atp-gateway",
     "language": "TypeScript",
     "framework": "Express.js",
     "database": "PostgreSQL 15",
     "test_results": { /* contents of results.json */ },
     "contact_email": "ops@myorg.com",
     "contact_name": "John Ops",
     "organization": "My Organization",
     "deployment_status": "development"
   }
   ```

4. **Wait for review:** ATP maintainers review within 3-5 business days

5. **Certification issued:** You'll receive a certificate and be listed on the registry

## Level 2: Standard Certification

### Requirements (all of Level 1, plus)

1. Run conformance test suite at Level 2
2. All 100+ tests pass
3. Avg latency < 200ms, P99 < 1000ms
4. Throughput > 500 req/sec
5. Error rate < 0.01%
6. Submit results and performance metrics
7. Provide deployment documentation

### Steps

1. **Run tests with metrics:**
   ```bash
   npm run test:standard -- \
     --output=results.json \
     --metrics=metrics.json \
     --duration=3600  # 1 hour load test
   ```

2. **Create submission:**
   ```json
   {
     "level": "standard",
     "implementation_name": "My ATP Gateway v1.0",
     "test_results": { /* ... */ },
     "metrics": {
       "avg_latency_ms": 145,
       "p99_latency_ms": 850,
       "throughput_req_sec": 650,
       "error_rate": 0.005,
       "peak_load": 1000,
       "load_duration_seconds": 3600
     },
     "deployment_documentation": "https://github.com/myorg/my-atp-gateway/blob/main/DEPLOYMENT.md",
     "contact_email": "ops@myorg.com",
     "organization": "My Organization",
     "deployment_status": "staging"
   }
   ```

3. **Submit:**
   ```bash
   curl -X POST https://registry.atp-protocol.org/api/v1/certifications \
     -H "Content-Type: application/json" \
     -d @submission.json
   ```

4. **Wait for review:** 1-2 weeks

## Level 3: Advanced Certification

### Requirements (all of Level 2, plus)

1. Run conformance test suite at Level 3
2. All 150+ tests pass
3. Performance metrics met
4. Security review completed (internal)
5. Deployment documentation
6. Evidence of federation testing (if used)
7. External attestation testing (if used)

### Steps

1. **Run tests:**
   ```bash
   npm run test:advanced -- --output=results.json
   ```

2. **Complete security checklist:**

   Create `security-checklist.md`:
   ```markdown
   # Security Checklist

   - [x] All traffic encrypted with TLS
   - [x] Database credentials stored securely (not in code/config)
   - [x] Signing keys rotated every 30 days
   - [x] Audit logs append-only and backed up
   - [x] Rate limiting enforced
   - [x] Request validation on all endpoints
   - [x] Privilege escalation tests pass
   - [x] No hardcoded secrets in code
   - [x] Code review process documented
   - [x] Incident response plan documented
   ```

3. **Create submission:**
   ```json
   {
     "level": "advanced",
     "test_results": { /* ... */ },
     "security_checklist": { /* ... */ },
     "contact_email": "ops@myorg.com",
     "organization": "My Organization",
     "deployment_status": "staging"
   }
   ```

4. **Submit:**
   ```bash
   curl -X POST https://registry.atp-protocol.org/api/v1/certifications \
     -H "Content-Type: application/json" \
     -d @submission.json
   ```

5. **Wait for review:** 1-2 weeks

## Level 4: Certified

### Requirements (all of Level 3, plus)

1. Run conformance test suite at Level 4
2. All 200+ tests pass
3. External security audit (optional but recommended)
4. Production deployment (required)
5. 30-day production track record
6. SLA commitments
7. Annual renewal fee

### Steps

1. **Run tests:**
   ```bash
   npm run test:certified -- \
     --output=results.json \
     --security-audit=audit-report.pdf
   ```

2. **Get external security audit (recommended):**

   Work with a firm like:
   - OpenZeppelin
   - Trail of Bits
   - Cure53
   - Your own security team

   Audit should cover:
   - Cryptographic implementation
   - Authorization/delegation logic
   - Approval workflows
   - Rate limiting correctness
   - Audit trail integrity
   - Threat model review

3. **Obtain production references:**

   Get letters from 2+ customers running your implementation:
   ```
   Company: Example Corp
   Start Date: 2026-02-01
   Environment: production
   Transactions/day: 50,000
   Uptime: 99.95%
   Contact: ops@example.com
   ```

4. **Create submission:**
   ```json
   {
     "level": "certified",
     "test_results": { /* ... */ },
     "security_audit": {
       "firm": "OpenZeppelin",
       "completion_date": "2026-03-01",
       "report_url": "https://...",
       "findings_critical": 0,
       "findings_high": 0,
       "findings_medium": 2,
       "findings_low": 5
     },
     "production_deployments": [
       {
         "customer": "Example Corp",
         "start_date": "2026-02-01",
         "tpd": 50000,
         "uptime": 99.95
       },
       { /* ... */ }
     ],
     "sla": {
       "uptime_guarantee": 99.95,
       "support_response_time": "4 hours",
       "emergency_contact": "..."
     },
     "contact_email": "ops@myorg.com",
     "organization": "My Organization",
     "deployment_status": "production"
   }
   ```

5. **Submit:**
   ```bash
   curl -X POST https://registry.atp-protocol.org/api/v1/certifications \
     -H "Content-Type: application/json" \
     -d @submission.json
   ```

6. **Pay certification fee:**
   - Level 4: $2,000/year
   - Covers review, listing, and ongoing maintenance

7. **Wait for review:** 2-4 weeks

## Renewal

Certifications renew annually:

### Level 1 & 2 (Free)
- Renew by running tests again and submitting
- No fee

### Level 3 (Free)
- Renew by running tests and updating security checklist
- No fee

### Level 4 ($2,000/year)
- Renew annually before expiration
- Re-run tests
- Update production deployment info
- Pay renewal fee

Renewal deadline: 30 days before expiration

## Registry Listing

Once certified, you appear on the ATP Registry:

**registry.atp-protocol.org/implementations**

Example listing:

```
ATP Gateway v1.0
Organization: My Organization
Language: TypeScript / Node.js
Database: PostgreSQL
Certification Level: 4 (Certified)
Certification Date: 2026-04-01
Deployment Status: Production
Repository: https://github.com/myorg/my-atp-gateway
Documentation: https://docs.myorg.com/atp-gateway
Contact: ops@myorg.com

Certified Features:
  ✓ Basic contract management
  ✓ Action proposal and approval
  ✓ Policy evaluation
  ✓ Evidence generation & audit
  ✓ Multi-signer approval flows
  ✓ Authority delegation
  ✓ Credential brokerage
  ✓ Action execution
  ✓ Cross-org federation
  ✓ Rate limiting & quotas
  ✓ External attestation
  ✓ Disaster recovery
  ✓ Cryptographic security
  ✓ Performance (1000+ req/sec)
  ✓ Concurrent operations
  ✓ Audit trail integrity

Customers:
  - Example Corp (50k tpd)
  - Other Company (30k tpd)
  - ...

SLA:
  Uptime: 99.95%
  Support: 4-hour response
```

## Badge

Once certified, you can add a badge to your repo:

```markdown
[![ATP Certified Level 4](https://registry.atp-protocol.org/badge/level-4.svg)](https://registry.atp-protocol.org/implementations/my-atp-gateway)
```

HTML:
```html
<a href="https://registry.atp-protocol.org/implementations/my-atp-gateway">
  <img src="https://registry.atp-protocol.org/badge/level-4.svg" alt="ATP Certified Level 4" />
</a>
```

## FAQ

**Q: How long does certification take?**
A: Level 1-2: 1 week, Level 3: 2 weeks, Level 4: 4 weeks including external audit

**Q: Can I get certified at multiple levels?**
A: Yes, start at Level 1, then work toward higher levels

**Q: What if I fail tests?**
A: Fix issues and resubmit. No limit on attempts.

**Q: Is certification required?**
A: No, you can run ATP without certification. Certification is optional but improves credibility.

**Q: Can I certify a modified version?**
A: Yes, submit a new certification request. Include version number and changelog.

**Q: What if my certification expires?**
A: You're delisted from the registry. Renew to be re-listed.

**Q: Can I transfer a Level 4 certification?**
A: Certifications are tied to the implementation, not the organization. A new organization would need to certify separately.

## Contact

For certification questions:

- Email: certification@atp-protocol.org
- Slack: #atp-certification (ATP community workspace)
- GitHub: [ATP Protocol Discussions](https://github.com/ATP-Protocol/atp-protocol/discussions)

## Next Steps

- **[Testing](./testing.md)** — Run the conformance suite
- **[Levels](./levels.md)** — Details on each level
- **[Registry](https://registry.atp-protocol.org)** — View certified implementations
