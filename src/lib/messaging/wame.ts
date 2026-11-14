import { messageText, type MessagingAdapter, type OutgoingMessage } from "./types";

/** https://wa.me/919840012345?text=... — opens WhatsApp with the message ready to send. */
export function waMeLink(to: string, text: string): string {
  return `https://wa.me/${to}?text=${encodeURIComponent(text)}`;
}

export const wameAdapter: MessagingAdapter = {
  mode: "wame",
  async send(message: OutgoingMessage) {
    return { status: "link", mode: "wame", link: waMeLink(message.to, messageText(message)) };
  },
};
