/** How a customer told the business they're happy to get WhatsApp messages. Shown in forms and on each customer. */
export const CONSENT_SOURCES = {
  billing: "Said yes at billing",
  counter_qr: "Scanned the counter QR",
  staff: "Told the staff",
  whatsapp: "Messaged the business first",
  import: "Owner confirmed for the whole list",
} as const;
export type ConsentSource = keyof typeof CONSENT_SOURCES;

export const consentLabel = (s: string | null | undefined) => (s && s in CONSENT_SOURCES ? CONSENT_SOURCES[s as ConsentSource] : s ?? "");
