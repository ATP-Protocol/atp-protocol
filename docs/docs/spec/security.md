---
sidebar_position: 9
---

# Security Considerations

ATP governs execution, but it does not make unsafe tools safe by itself. Implementations must fail closed, preserve audit evidence, and keep enforcement outside the agent process.

## Enforcement boundaries

ATP checks must run at the gateway, wrapper, or tool boundary. Do not rely on agent prompts to enforce authority, policy, approval, credential use, or evidence capture.

Minimum enforcement points:

- validate the contract before execution;
- evaluate policy against the exact request parameters;
- bind approvals to the requested action and scope;
- inject credentials only after policy and approval pass;
- capture evidence before returning the final result;
- deny execution when validation, credential resolution, approval, or evidence capture fails.

## Credential safety

Credentials must never be returned to the agent as raw values. Use credential injection headers, sockets, short-lived tokens, or other mediated delivery paths controlled by the gateway or wrapper.

Recommended controls:

- keep credential stores outside the model context;
- record provider, scope, and injection method in evidence;
- redact credential values from logs;
- expire or rotate credentials independently of ATP contracts;
- use `fail_closed: true` for production credentials.

## Evidence integrity

Evidence should be immutable once recorded. If evidence is stored locally before external attestation, implementations should preserve hashes and timestamps so later anchoring can prove continuity.

Recommended controls:

- hash request and response payloads instead of storing sensitive raw payloads;
- include contract, authority, wallet, organization, action, outcome, and gateway ID;
- store approval records when approval was required;
- verify stored records before reporting conformance;
- make external attestation failure explicit rather than silently treating it as success.

## Threat checklist

| Threat | Required mitigation |
|--------|---------------------|
| Prompt injection asks the agent to bypass ATP | Keep ATP enforcement outside the prompt and tool description |
| Agent requests an out-of-scope action | Deny before handler execution |
| Credential cannot be resolved | Fail closed unless the contract explicitly allows degraded dev mode |
| Approval is granted for a different scope | Reject approval records not bound to the exact action and scope |
| Evidence write fails | Return a failed or degraded outcome, depending on contract attestation level |
| Gateway loses state during execution | Use idempotency keys and unknown-outcome handling |
| Audit backend is unavailable | Queue with integrity hashes or fail closed for attested contracts |

## Conformance impact

Security behavior is part of conformance. A gateway cannot claim ATP-Verified or ATP-Attested if it allows policy bypass, raw credential exposure, missing approval binding, or unverified evidence storage.
