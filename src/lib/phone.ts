/**
 * Phone numbers are stored the way WhatsApp's API wants them:
 * country code + number, digits only, no "+" (e.g. "919840012345").
 *
 * Indian numbers are the default: a bare 10-digit mobile, or one written
 * with a leading 0, gets +91 in front.
 */

export type PhoneResult =
  | { ok: true; phone: string }
  | { ok: false; reason: string };

export function normalizePhone(input: string, defaultCountry = "91"): PhoneResult {
  const raw = (input ?? "").trim();
  if (!raw) return { ok: false, reason: "empty" };

  const hadPlus = raw.startsWith("+") || raw.startsWith("00");
  let digits = raw.replace(/\D/g, "");
  if (raw.startsWith("00")) digits = digits.slice(2);

  if (!hadPlus) {
    // 09840012345 → 9840012345
    if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
    // 9840012345 → 919840012345
    if (digits.length === 10) digits = defaultCountry + digits;
  }

  if (digits.startsWith("91")) {
    const national = digits.slice(2);
    if (national.length !== 10) return { ok: false, reason: "Indian numbers need 10 digits" };
    if (!/^[6-9]/.test(national)) return { ok: false, reason: "not an Indian mobile number" };
    return { ok: true, phone: digits };
  }

  if (digits.length < 8 || digits.length > 15) return { ok: false, reason: "wrong length" };
  return { ok: true, phone: digits };
}

/** "919840012345" → "+91 98400 12345" for display. */
export function formatPhone(phone: string): string {
  if (phone.startsWith("91") && phone.length === 12) {
    const n = phone.slice(2);
    return `+91 ${n.slice(0, 5)} ${n.slice(5)}`;
  }
  return `+${phone}`;
}
