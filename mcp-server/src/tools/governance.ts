/**
 * ATP Governance Tools
 *
 * Tools for executing governed actions, registering contracts, binding authorities,
 * and managing credentials within the ATP gateway.
 */

import { z } from "zod";
import { getGateway } from "../gateway-instance";
import type { ATPContract } from "@atp-protocol/sdk";
import type { ExecutionRequest } from "@atp-protocol/gateway";

/**
 * Input schema for atp_govern_execute
 */
export const GovernExecuteInput = z.object({
  contract_id: z.string().describe("ID of the registered contract"),
  action: z.string().describe("Name of the action to execute"),
  params: z.record(z.unknown()).describe("Parameters for the action"),
  wallet: z.string().describe("Wallet address performing the action"),
  idempotency_key: z.string().optional().describe("Optional idempotency key"),
});

export type GovernExecuteInput = z.infer<typeof GovernExecuteInput>;

/**
 * Execute a governed action through the ATP gateway.
 *
 * This is the core execution endpoint that orchestrates the full ATP pipeline:
 *
 * 1. **Authority Check** — Verify the wallet is bound to an org with the required authority
 * 2. **Policy Evaluation** — Check request parameters against contract constraints
 * 3. **Approval Gate** — If required, create an approval request (see atp_approve)
 * 4. **Credential Resolution** — Fetch and inject any required credentials
 * 5. **Tool Execution** — Call the registered tool handler
 * 6. **Evidence Capture** — Record full execution details for audit/compliance
 *
 * Returns one of these outcomes:
 * - `outcome:success` — action completed successfully
 * - `outcome:denied` — blocked at authority/policy/approval/credential stage
 * - `outcome:failure` — execution failed
 * - `outcome:timeout` — action exceeded timeout
 * - `outcome:partial` — partially succeeded
 * - `outcome:unknown` — status unknown (e.g. 202 Accepted responses)
 *
 * If approval is required (and denied_stage is "approval"), use the approval_id
 * from the response with atp_approve to complete the flow.
 *
 * Use this when: executing any tool action that needs ATP governance,
 * running actions that require approval, or building compliant workflows.
 */
export async function governExecuteTool(input: GovernExecuteInput): Promise<object> {
  const gateway = getGateway();

  const request: ExecutionRequest = {
    contract_id: input.contract_id,
    action: input.action,
    params: input.params,
    wallet: input.wallet,
    idempotency_key: input.idempotency_key,
  };

  const response = await gateway.execute(request);

  return {
    execution_id: response.execution_id,
    outcome: response.outcome,
    result: response.result || null,
    evidence_id: response.evidence_id || null,
    approval_id: response.approval_id || null,
    denied_reason: response.denied_reason || null,
    denied_stage: response.denied_stage || null,
    started_at: response.started_at,
    completed_at: response.completed_at,
  };
}

/**
 * Input schema for atp_register_contract
 */
export const RegisterContractInput = z.object({
  contract_id: z.string().describe("Unique identifier for the contract"),
  contract: z.record(z.unknown()).describe("ATP contract object"),
});

export type RegisterContractInput = z.infer<typeof RegisterContractInput>;

/**
 * Register a contract with the ATP gateway.
 *
 * Before a contract can be used in atp_govern_execute, it must be registered
 * with the gateway. This stores the contract in the gateway's contract store
 * and validates it.
 *
 * The contract defines:
 * - What actions it permits
 * - What approvals are needed
 * - What credentials are required
 * - What policy constraints apply
 * - What evidence level is required
 *
 * Contracts remain registered for the lifetime of the gateway process.
 * To deactivate a contract, use atp_revoke_contract (future tool).
 *
 * Use this when: loading a new contract for the first time,
 * updating contract definitions, or bootstrapping the gateway.
 */
export async function registerContractTool(input: RegisterContractInput): Promise<object> {
  const gateway = getGateway();

  try {
    gateway.contracts.register(input.contract_id, input.contract as unknown as ATPContract);

    return {
      contract_id: input.contract_id,
      registered: true,
      registered_at: new Date().toISOString(),
      gateway_id: gateway.config.gateway_id,
    };
  } catch (error) {
    return {
      contract_id: input.contract_id,
      registered: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Input schema for atp_bind_authority
 */
export const BindAuthorityInput = z.object({
  wallet: z.string().describe("Wallet address to bind"),
  org_id: z.string().describe("Organization ID"),
  role: z.string().describe("Role within the organization"),
  authorities: z
    .array(z.string())
    .describe("Array of authority strings (e.g., 'org.procurement.*')"),
  constraints: z
    .record(z.unknown())
    .optional()
    .describe("Optional constraints on the binding"),
});

export type BindAuthorityInput = z.infer<typeof BindAuthorityInput>;

/**
 * Bind a wallet to an organization with a specific role and authorities.
 *
 * Authority bindings are the foundation of ATP's authorization layer.
 * They establish:
 * - Which wallet is acting
 * - Which organization it represents
 * - What role it holds in that org
 * - What authorities it has (e.g., "org.procurement.send-email")
 *
 * Authority strings can use wildcards:
 * - `org.procurement.send-email` — exact match
 * - `org.procurement.*` — all procurement authorities
 * - `org.*` — all org authorities
 *
 * Once bound, the wallet can execute actions whose contracts require
 * matching authorities. Authority checks happen automatically in atp_govern_execute.
 *
 * Use this when: onboarding agents into the system,
 * changing an agent's role, or granting new authorities.
 */
export async function bindAuthorityTool(input: BindAuthorityInput): Promise<object> {
  const gateway = getGateway();

  try {
    gateway.authority.bind(input.wallet, {
      org_id: input.org_id,
      role: input.role,
      authorities: input.authorities,
      constraints: input.constraints,
    });

    return {
      wallet: input.wallet,
      org_id: input.org_id,
      role: input.role,
      authorities: input.authorities,
      bound_at: new Date().toISOString(),
    };
  } catch (error) {
    return {
      wallet: input.wallet,
      bound: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Input schema for atp_store_credential
 */
export const StoreCredentialInput = z.object({
  key: z.string().describe("Unique key for the credential in the store"),
  provider: z
    .string()
    .describe("Credential provider (e.g., 'github-api', 'gmail-api', 'stripe-api')"),
  credential_type: z
    .enum(["oauth_token", "api_key", "bearer_token", "basic_auth", "custom"])
    .describe("Type of credential"),
  value: z.string().describe("Credential value (token, key, etc.)"),
  scope: z
    .array(z.string())
    .describe("Scopes granted by the credential (e.g., 'send', 'read', 'write')"),
  org_id: z.string().describe("Organization ID that owns this credential"),
  expires_at: z.string().optional().describe("ISO 8601 expiry timestamp (optional)"),
});

export type StoreCredentialInput = z.infer<typeof StoreCredentialInput>;

/**
 * Store a credential in the ATP gateway.
 *
 * Credentials are used by the gateway to inject authentication into tool handlers.
 * When a contract specifies credential requirements, the gateway:
 * 1. Looks up the credential by provider and organization
 * 2. Verifies the credential has the required scopes
 * 3. Injects it into the tool handler (as Authorization header, API key, etc.)
 * 4. Records credential usage in the evidence
 *
 * In production, credentials would be encrypted or stored in a vault.
 * This reference implementation stores them in memory for demonstration.
 *
 * Use this when: configuring tool credentials for an organization,
 * rotating API keys, or adding OAuth tokens.
 *
 * WARNING: This stores credentials in plaintext in memory. Do not use in production
 * without integrating with a proper secrets vault (e.g., HashiCorp Vault, AWS Secrets Manager).
 */
export async function storeCredentialTool(input: StoreCredentialInput): Promise<object> {
  const gateway = getGateway();

  try {
    gateway.credentials.store(input.key, {
      provider: input.provider,
      credential_type: input.credential_type,
      value: input.value,
      scope: input.scope,
      org_id: input.org_id,
      expires_at: input.expires_at,
    });

    return {
      key: input.key,
      provider: input.provider,
      org_id: input.org_id,
      credential_type: input.credential_type,
      scope: input.scope,
      stored_at: new Date().toISOString(),
      expires_at: input.expires_at || null,
    };
  } catch (error) {
    return {
      key: input.key,
      stored: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Input schema for atp_register_tool
 */
export const RegisterToolInput = z.object({
  tool_name: z.string().describe("Name of the tool action"),
  contract_id: z.string().describe("Contract ID that governs this tool"),
});

export type RegisterToolInput = z.infer<typeof RegisterToolInput>;

/**
 * Register a tool handler with ATP governance.
 *
 * This registers the binding between an action name and its governing contract.
 * The handler runs after all ATP checks pass (authority, policy, approval, credentials).
 *
 * Use this when: onboarding new MCP tools into the governance system,
 * changing which contract governs a tool, or testing governance flows.
 */
export async function registerToolTool(input: RegisterToolInput): Promise<object> {
  const gateway = getGateway();

  try {
    gateway.registerTool(
      input.tool_name,
      input.contract_id,
      async (params) => ({
        status: 200,
        body: {
          message: `Tool "${input.tool_name}" executed under contract "${input.contract_id}"`,
          params,
          executed_at: new Date().toISOString(),
        },
      })
    );

    return {
      tool_name: input.tool_name,
      contract_id: input.contract_id,
      registered: true,
      registered_at: new Date().toISOString(),
      handler_type: "echo", // In production: "real", "mock", etc.
    };
  } catch (error) {
    return {
      tool_name: input.tool_name,
      registered: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
