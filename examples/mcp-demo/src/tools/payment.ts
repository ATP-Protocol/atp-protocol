/**
 * Approve Payment Tool
 *
 * Mock implementation that logs payment approvals.
 * Demonstrates conditional approval based on amount.
 */

export interface PaymentParams {
  vendor_id: string;
  amount: number;
  currency: string;
  invoice_number: string;
  description?: string;
}

export async function handleApprovePayment(
  params: PaymentParams,
  injectedHeaders?: Record<string, string>
): Promise<{ status: number; body: unknown }> {
  const {
    vendor_id,
    amount,
    currency,
    invoice_number,
    description = "",
  } = params;

  // In a real implementation, this would call the banking API with injected credentials
  const transactionId = `txn_${Math.random().toString(36).slice(2, 9)}`;

  console.log(`  [EXEC] Payment handler called with:`, {
    vendor_id,
    amount,
    currency,
    credentialInjected: !!injectedHeaders?.["X-API-Key"],
  });

  return {
    status: 200,
    body: {
      transaction_id: transactionId,
      status: "processed",
      vendor_id,
      amount,
      currency,
      invoice_number,
      processed_at: new Date().toISOString(),
    },
  };
}
