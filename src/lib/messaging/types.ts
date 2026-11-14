/**
 * The messaging adapter: the ONE place in Orbit that knows how a WhatsApp
 * message actually leaves. Every feature (review requests, reminders,
 * offers…) builds an OutgoingMessage and hands it to an adapter.
 *
 * Modes:
 *  - "wame":     pilot. Builds a one-tap wa.me link; staff tap it and press send.
 *  - "meta":     direct Meta WhatsApp Cloud API (us as Tech Provider).
 *  - "provider": backup BSP (e.g. 360dialog) if Meta's review stalls. Not built yet.
 */

export type MessagingMode = "wame" | "meta" | "provider";

export type OutgoingMessage =
  | {
      kind: "template";
      to: string; // digits only, e.g. "919840012345"
      templateName: string;
      language: string; // e.g. "en", "ta"
      bodyParams?: string[];
      /** Final text as the customer would read it. Used by wa.me mode. */
      previewText: string;
    }
  | {
      kind: "text";
      to: string;
      text: string;
    };

/** What a business's WhatsApp connection looks like to the adapter. */
export type Channel = {
  phoneNumberId?: string | null;
  accessToken?: string | null;
};

export type SendResult =
  | { status: "sent"; mode: MessagingMode; providerMessageId: string }
  | { status: "link"; mode: "wame"; link: string }
  | { status: "failed"; mode: MessagingMode; error: string; code?: number };

export interface MessagingAdapter {
  readonly mode: MessagingMode;
  send(message: OutgoingMessage, channel: Channel): Promise<SendResult>;
}

/** Text the customer will see, whatever the message kind. */
export function messageText(m: OutgoingMessage): string {
  return m.kind === "text" ? m.text : m.previewText;
}
