#!/usr/bin/env node

/**
 * ATP MCP Server
 *
 * Exposes ATP governance capabilities as MCP tools.
 * Any MCP client (Claude Code, Cursor, etc.) can use ATP to govern agent execution.
 *
 * @example
 * ```bash
 * # Install globally
 * npm install -g @atp-protocol/mcp-server
 *
 * # Or run directly
 * npx @atp-protocol/mcp-server
 * ```
 *
 * Add to claude_desktop_config.json:
 * ```json
 * {
 *   "mcpServers": {
 *     "atp": {
 *       "command": "npx",
 *       "args": ["@atp-protocol/mcp-server"]
 *     }
 *   }
 * }
 * ```
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { zodToJsonSchema } from "zod-to-json-schema";

// Import validation tools
import {
  ValidateContractInput,
  validateContractTool,
  EvaluatePolicyInput,
  evaluatePolicyTool,
  CheckApprovalInput,
  checkApprovalTool,
} from "./tools/validation";

// Import governance tools
import {
  GovernExecuteInput,
  governExecuteTool,
  RegisterContractInput,
  registerContractTool,
  BindAuthorityInput,
  bindAuthorityTool,
  StoreCredentialInput,
  storeCredentialTool,
  RegisterToolInput,
  registerToolTool,
} from "./tools/governance";

// Import evidence tools
import {
  GetEvidenceInput,
  getEvidenceTool,
  ListPendingApprovalsInput,
  listPendingApprovalsTool,
  ApproveInput,
  approveTool,
} from "./tools/evidence";

// Import status tools
import { GatewayStatusInput, gatewayStatusTool } from "./tools/status";

// ============================================================================
// Initialize Server
// ============================================================================

const server = new Server({
  name: "atp-governance",
  version: "0.1.0",
});

// ============================================================================
// Tool Definitions
// ============================================================================

function toJsonSchema(schema: any): object {
  try {
    return zodToJsonSchema(schema) as object;
  } catch {
    return { type: "object", properties: {} };
  }
}

const tools = [
  {
    name: "atp_validate_contract",
    description:
      "Validate an ATP execution contract for correctness and spec compliance. " +
      "Check for required fields, valid types, and proper structure.",
    inputSchema: toJsonSchema(ValidateContractInput),
  },
  {
    name: "atp_evaluate_policy",
    description:
      "Evaluate request parameters against a contract's policy constraints. " +
      "Check if params like recipient, amount, etc. are permitted. Local validation only (no gateway call).",
    inputSchema: toJsonSchema(EvaluatePolicyInput),
  },
  {
    name: "atp_check_approval",
    description:
      "Check if a contract requires approval for given parameters. " +
      "Returns approver role and escalation path if approval is needed.",
    inputSchema: toJsonSchema(CheckApprovalInput),
  },
  {
    name: "atp_govern_execute",
    description:
      "Execute an action through the full ATP governance pipeline. " +
      "Orchestrates authority, policy, approval, credentials, execution, and evidence capture. " +
      "This is the primary execution endpoint.",
    inputSchema: toJsonSchema(GovernExecuteInput),
  },
  {
    name: "atp_register_contract",
    description:
      "Register a contract with the ATP gateway. " +
      "Must be called before a contract can be used in atp_govern_execute.",
    inputSchema: toJsonSchema(RegisterContractInput),
  },
  {
    name: "atp_bind_authority",
    description:
      "Bind a wallet to an organization with a specific role and authorities. " +
      "Establishes the authorization foundation for ATP governance.",
    inputSchema: toJsonSchema(BindAuthorityInput),
  },
  {
    name: "atp_store_credential",
    description:
      "Store a credential (API key, OAuth token, etc.) in the gateway. " +
      "Credentials are injected into tool handlers during execution. " +
      "WARNING: Demo implementation stores in plaintext; use a vault in production.",
    inputSchema: toJsonSchema(StoreCredentialInput),
  },
  {
    name: "atp_register_tool",
    description:
      "Register a tool handler with ATP governance. " +
      "Binds an action name to a contract ID. In production, includes real handler logic.",
    inputSchema: toJsonSchema(RegisterToolInput),
  },
  {
    name: "atp_get_evidence",
    description:
      "Retrieve a complete evidence record by ID. " +
      "Evidence provides audit trail: who requested what, policy constraints evaluated, " +
      "approval status, credentials used, outcome, and cryptographic hashes.",
    inputSchema: toJsonSchema(GetEvidenceInput),
  },
  {
    name: "atp_list_pending_approvals",
    description:
      "List all pending approval requests waiting for approver action. " +
      "Use atp_approve to approve and execute a pending request.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "atp_approve",
    description:
      "Approve a pending request and proceed with execution. " +
      "Approver must have the required approver_role. " +
      "Returns the final execution result after approval is consumed.",
    inputSchema: toJsonSchema(ApproveInput),
  },
  {
    name: "atp_gateway_status",
    description:
      "Get gateway metadata, conformance level, and health status. " +
      "Shows registered contracts, pending approvals, and evidence statistics.",
    inputSchema: { type: "object", properties: {} },
  },
];

// ============================================================================
// Tool Handlers
// ============================================================================

async function callTool(name: string, input: unknown): Promise<unknown> {
  switch (name) {
    // Validation tools
    case "atp_validate_contract":
      return await validateContractTool(input as ValidateContractInput);
    case "atp_evaluate_policy":
      return await evaluatePolicyTool(input as EvaluatePolicyInput);
    case "atp_check_approval":
      return await checkApprovalTool(input as CheckApprovalInput);

    // Governance tools
    case "atp_govern_execute":
      return await governExecuteTool(input as GovernExecuteInput);
    case "atp_register_contract":
      return await registerContractTool(input as RegisterContractInput);
    case "atp_bind_authority":
      return await bindAuthorityTool(input as BindAuthorityInput);
    case "atp_store_credential":
      return await storeCredentialTool(input as StoreCredentialInput);
    case "atp_register_tool":
      return await registerToolTool(input as RegisterToolInput);

    // Evidence tools
    case "atp_get_evidence":
      return await getEvidenceTool(input as GetEvidenceInput);
    case "atp_list_pending_approvals":
      return await listPendingApprovalsTool(input as ListPendingApprovalsInput);
    case "atp_approve":
      return await approveTool(input as ApproveInput);

    // Status tools
    case "atp_gateway_status":
      return await gatewayStatusTool(input as GatewayStatusInput);

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ============================================================================
// Request Handlers
// ============================================================================

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const result = await callTool(request.params.name, request.params.arguments);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
});

// ============================================================================
// Server Startup
// ============================================================================

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("ATP MCP server running on stdio");
}

main().catch(console.error);
