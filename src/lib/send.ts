import "server-only";
import { getAdapter, messageText, type MessagingMode, type OutgoingMessage, type SendResult } from "./messaging";
import { canMessageCustomer } from "./messaging/rules";
import { tokenFor } from "./sandbox";
import { supabaseAdmin } from "./supabase/server";

type Business = {
  id: string;
  is_sandbox: boolean;
  messaging_mode: MessagingMode;
  wa_phone_number_id: string | null;
  quiet_start: string;
  quiet_end: string;
  timezone: string;
};

/**
 * The one entry point for sending. Checks the ground rules for real customers,
 * sends through the business's adapter, and logs the message.
 */
export async function sendMessage(opts: {
  business: Business;
  message: OutgoingMessage;
  customerId?: string;
  reviewRequestId?: string;
  sentBy?: string;
}): Promise<SendResult> {
  const { business, message } = opts;
  const db = supabaseAdmin();

  if (opts.customerId) {
    const { data: customer } = await db
      .from("customers")
      .select("consent_at, opted_out_at")
      .eq("id", opts.customerId)
      .single();
    const check = customer
      ? canMessageCustomer(customer, new Date(), {
          start: business.quiet_start,
          end: business.quiet_end,
          timeZone: business.timezone,
        })
      : ({ ok: false, reason: "Customer not found" } as const);
    if (!check.ok) return { status: "failed", mode: business.messaging_mode, error: check.reason };
  }

  const result = await getAdapter(business.messaging_mode).send(message, {
    phoneNumberId: business.wa_phone_number_id,
    accessToken: await tokenFor(business),
  });

  await db.from("messages").insert({
    business_id: business.id,
    customer_id: opts.customerId ?? null,
    review_request_id: opts.reviewRequestId ?? null,
    direction: "out",
    kind: message.kind,
    template_name: message.kind === "template" ? message.templateName : null,
    phone: message.to,
    body: messageText(message),
    mode: result.mode,
    wa_message_id: result.status === "sent" ? result.providerMessageId : null,
    status: result.status === "sent" ? "sent" : result.status === "link" ? "link" : "failed",
    error: result.status === "failed" ? result.error : null,
    sent_by: opts.sentBy ?? null,
    status_at: new Date().toISOString(),
  });

  return result;
}
