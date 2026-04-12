/**
 * Read Inventory Tool
 *
 * Mock implementation that returns inventory data.
 * Demonstrates lightweight governance: no approval needed, simple bearer token.
 */

export interface InventoryParams {
  warehouse_id?: string;
  category?: string;
}

export async function handleReadInventory(
  params: InventoryParams,
  injectedHeaders?: Record<string, string>
): Promise<{ status: number; body: unknown }> {
  const { warehouse_id = "wh_default", category = "all" } = params;

  console.log(`  [EXEC] Inventory handler called with:`, {
    warehouse_id,
    category,
    credentialInjected: !!injectedHeaders?.Authorization,
  });

  // Mock inventory data
  const inventory = {
    warehouse_id,
    category,
    items: [
      { sku: "PART-001", name: "Widget A", quantity: 150, location: "A-1-2" },
      { sku: "PART-002", name: "Widget B", quantity: 87, location: "B-3-1" },
      { sku: "PART-003", name: "Gadget X", quantity: 42, location: "C-2-5" },
    ],
    last_counted: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  };

  return {
    status: 200,
    body: {
      inventory,
      timestamp: new Date().toISOString(),
    },
  };
}
