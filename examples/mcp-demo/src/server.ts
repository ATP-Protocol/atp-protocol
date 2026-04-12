/**
 * MCP Server with ATP Governance
 *
 * Sets up the gateway, registers contracts, tools, and authority bindings.
 */

import { ATPGateway } from "../../../gateway/src/gateway";
import { handleSendEmail } from "./tools/email";
import { handleReadInventory } from "./tools/inventory";
import { handleApprovePayment } from "./tools/payment";
import sendEmailContract from "./contracts/send-email.json";
import readInventoryContract from "./contracts/read-inventory.json";
import approvePaymentContract from "./contracts/approve-payment.json";

export async function setupDemoGateway(): Promise<ATPGateway> {
  const gateway = new ATPGateway({
    gateway_id: "gw_demo_01",
    conformance_level: "verified",
  });

  // ---------------------------------------------------------------------------
  // Register Contracts
  // ---------------------------------------------------------------------------
  gateway.contracts.register("ctr_send_email", sendEmailContract);
  gateway.contracts.register("ctr_read_inventory", readInventoryContract);
  gateway.contracts.register("ctr_approve_payment", approvePaymentContract);

  // ---------------------------------------------------------------------------
  // Register Authority Bindings
  // ---------------------------------------------------------------------------

  // Alice: procurement agent with authority to send emails
  gateway.authority.bind("0xAlice", {
    org_id: "org_acme",
    role: "procurement_agent",
    authorities: ["org.procurement.send-email", "org.operations.read-inventory"],
  });

  // Bob: procurement manager (can approve)
  gateway.authority.bind("0xBob", {
    org_id: "org_acme",
    role: "procurement_manager",
    authorities: [
      "org.procurement.send-email",
      "org.operations.read-inventory",
    ],
  });

  // Charlie: finance controller
  gateway.authority.bind("0xCharlie", {
    org_id: "org_acme",
    role: "finance_controller",
    authorities: ["org.finance.approve-payment", "org.operations.read-inventory"],
  });

  // ---------------------------------------------------------------------------
  // Register Credentials
  // ---------------------------------------------------------------------------

  // Gmail OAuth token for email
  gateway.credentials.store("org_acme:gmail", {
    provider: "gmail",
    credential_type: "oauth_token",
    value: "goog_ya29_...demo_token",
    scope: ["mail.send"],
    org_id: "org_acme",
    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  });

  // Inventory API bearer token
  gateway.credentials.store("org_acme:inventory-api", {
    provider: "inventory-api",
    credential_type: "bearer_token",
    value: "inv_tk_demo_abc123xyz",
    scope: ["inventory.read"],
    org_id: "org_acme",
    expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
  });

  // Banking API key for payments
  gateway.credentials.store("org_acme:banking-api", {
    provider: "banking-api",
    credential_type: "api_key",
    value: "bk_demo_key_prod_2024",
    scope: ["payments.process"],
    org_id: "org_acme",
    expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
  });

  // ---------------------------------------------------------------------------
  // Register Tool Handlers
  // ---------------------------------------------------------------------------
  gateway.registerTool("send-email", "ctr_send_email", handleSendEmail);
  gateway.registerTool("read-inventory", "ctr_read_inventory", handleReadInventory);
  gateway.registerTool("approve-payment", "ctr_approve_payment", handleApprovePayment);

  return gateway;
}
