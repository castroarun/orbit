/**
 * Turns Meta's nested webhook payload into a flat list of events Orbit cares about.
 * Docs: WhatsApp Cloud API webhooks, field "messages" and "message_template_status_update".
 */

export type InboundMessageEvent = {
  type: "inbound";
  phoneNumberId: string;
  from: string; // customer's number, digits
  profileName?: string;
  waMessageId: string;
  timestamp: Date;
  messageType: string;
  text: string | null;
};

export type StatusEvent = {
  type: "status";
  phoneNumberId: string;
  waMessageId: string;
  status: "sent" | "delivered" | "read" | "failed" | string;
  timestamp: Date;
  recipient: string;
  pricingCategory?: string; // utility | marketing | service | authentication …
  error?: string;
};

export type TemplateStatusEvent = {
  type: "template_status";
  wabaId: string;
  templateId: string;
  name: string;
  language: string;
  event: string; // APPROVED | REJECTED | PAUSED | …
  reason?: string;
};

export type WebhookEvent = InboundMessageEvent | StatusEvent | TemplateStatusEvent;

/* eslint-disable @typescript-eslint/no-explicit-any */
function textOf(m: any): string | null {
  switch (m?.type) {
    case "text":
      return m.text?.body ?? null;
    case "button":
      return m.button?.text ?? null;
    case "interactive":
      return m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? null;
    case "image":
    case "video":
    case "document":
      return m[m.type]?.caption ?? null;
    default:
      return null;
  }
}

const ts = (s: unknown) => new Date(Number(s) * 1000);

export function parseWebhook(payload: any): WebhookEvent[] {
  const events: WebhookEvent[] = [];
  if (payload?.object !== "whatsapp_business_account") return events;

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value ?? {};

      if (change.field === "messages") {
        const phoneNumberId = value.metadata?.phone_number_id;
        const names = new Map<string, string>(
          (value.contacts ?? []).map((c: any) => [c.wa_id, c.profile?.name]),
        );

        for (const m of value.messages ?? []) {
          events.push({
            type: "inbound",
            phoneNumberId,
            from: m.from,
            profileName: names.get(m.from),
            waMessageId: m.id,
            timestamp: ts(m.timestamp),
            messageType: m.type,
            text: textOf(m),
          });
        }

        for (const s of value.statuses ?? []) {
          events.push({
            type: "status",
            phoneNumberId,
            waMessageId: s.id,
            status: s.status,
            timestamp: ts(s.timestamp),
            recipient: s.recipient_id,
            pricingCategory: s.pricing?.category,
            error: s.errors?.[0] ? `${s.errors[0].code}: ${s.errors[0].title ?? s.errors[0].message ?? ""}`.trim() : undefined,
          });
        }
      }

      if (change.field === "message_template_status_update") {
        events.push({
          type: "template_status",
          wabaId: entry.id,
          templateId: String(value.message_template_id),
          name: value.message_template_name,
          language: value.message_template_language,
          event: value.event,
          reason: value.reason && value.reason !== "NONE" ? value.reason : undefined,
        });
      }
    }
  }
  return events;
}
