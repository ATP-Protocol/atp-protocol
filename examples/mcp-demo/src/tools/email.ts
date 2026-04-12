/**
 * Send Email Tool
 *
 * Mock implementation that logs email operations.
 * Demonstrates full ATP governance: authority, policy, approval, credentials, execution.
 */

export interface EmailParams {
  to: string;
  subject: string;
  body?: string;
  attachments?: { filename: string; size: number }[];
}

export async function handleSendEmail(
  params: EmailParams,
  injectedHeaders?: Record<string, string>
): Promise<{ status: number; body: unknown }> {
  // In a real tool, this would validate params against policy,
  // and use injected credentials (OAuth token) to send via Gmail API

  const { to, subject, body = "", attachments = [] } = params;

  // Simulate successful email send
  const messageId = `msg_${Math.random().toString(36).slice(2, 9)}`;

  console.log(`  [EXEC] Email handler called with:`, {
    to,
    subject,
    attachmentCount: attachments.length,
    credentialInjected: !!injectedHeaders?.Authorization,
  });

  return {
    status: 200,
    body: {
      message_id: messageId,
      sent: true,
      timestamp: new Date().toISOString(),
      to,
      subject,
      attachment_count: attachments.length,
    },
  };
}
