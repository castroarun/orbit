import { friendlyMetaError } from "../meta/errors";
import { graphRequest, MetaApiError, type FetchLike } from "../meta/graph";
import type { Channel, MessagingAdapter, OutgoingMessage, SendResult } from "./types";

/** Build the Cloud API request body for one message. */
export function buildMetaPayload(message: OutgoingMessage) {
  const base = { messaging_product: "whatsapp", recipient_type: "individual", to: message.to };

  if (message.kind === "text") {
    return { ...base, type: "text", text: { preview_url: true, body: message.text } };
  }

  const parts = [
    ...(message.headerImageUrl
      ? [{ type: "header", parameters: [{ type: "image", image: { link: message.headerImageUrl } }] }]
      : []),
    ...(message.bodyParams?.length
      ? [{ type: "body", parameters: message.bodyParams.map((text) => ({ type: "text", text })) }]
      : []),
  ];
  const components = parts.length ? parts : undefined;

  return {
    ...base,
    type: "template",
    template: {
      name: message.templateName,
      language: { code: message.language },
      ...(components ? { components } : {}),
    },
  };
}

export function createMetaAdapter(fetchImpl: FetchLike = fetch): MessagingAdapter {
  return {
    mode: "meta",
    async send(message: OutgoingMessage, channel: Channel): Promise<SendResult> {
      if (!channel.phoneNumberId || !channel.accessToken) {
        return { status: "failed", mode: "meta", error: "This business has no WhatsApp API connection yet" };
      }
      try {
        const res = await graphRequest<{ messages?: { id: string }[] }>(
          `${channel.phoneNumberId}/messages`,
          channel.accessToken,
          { method: "POST", body: buildMetaPayload(message) },
          fetchImpl,
        );
        const id = res.messages?.[0]?.id;
        if (!id) return { status: "failed", mode: "meta", error: "Meta did not return a message id" };
        return { status: "sent", mode: "meta", providerMessageId: id };
      } catch (e) {
        if (e instanceof MetaApiError) return { status: "failed", mode: "meta", error: friendlyMetaError(e.code, e.message, e.subcode), code: e.code };
        return { status: "failed", mode: "meta", error: e instanceof Error ? e.message : String(e) };
      }
    },
  };
}
