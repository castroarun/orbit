/**
 * Ground rules every customer message must pass (business-playbook §6):
 *  - only consenting customers
 *  - "STOP" / "வேண்டாம்" ends all messages
 *  - nothing between 20:00 and 9:00 (business's local time)
 */

const STOP_WORDS = ["stop", "unsubscribe", "வேண்டாம்", "நிறுத்து", "stop messages"];

export function isStopMessage(text: string | null | undefined): boolean {
  if (!text) return false;
  const t = text.trim().toLowerCase().replace(/[.!\s]+$/u, "");
  return STOP_WORDS.includes(t);
}

/** Minutes since midnight in the given time zone. */
function localMinutes(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const h = Number(parts.find((p) => p.type === "hour")?.value);
  const m = Number(parts.find((p) => p.type === "minute")?.value);
  return h * 60 + m;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
}

/** True if `at` falls inside quiet hours (default 20:00–09:00 India time). */
export function isQuietHours(
  at: Date,
  opts: { start?: string; end?: string; timeZone?: string } = {},
): boolean {
  const start = toMinutes(opts.start ?? "20:00");
  const end = toMinutes(opts.end ?? "09:00");
  const now = localMinutes(at, opts.timeZone ?? "Asia/Kolkata");
  return start > end ? now >= start || now < end : now >= start && now < end;
}

export type CustomerForSending = {
  consent_at: string | null;
  opted_out_at: string | null;
};

export type SendCheck = { ok: true } | { ok: false; reason: string };

export function canMessageCustomer(
  customer: CustomerForSending,
  at: Date,
  quiet?: { start?: string; end?: string; timeZone?: string },
): SendCheck {
  if (customer.opted_out_at) return { ok: false, reason: "Customer said STOP" };
  if (!customer.consent_at) return { ok: false, reason: "No consent recorded" };
  if (isQuietHours(at, quiet)) return { ok: false, reason: "Quiet hours (20:00–9:00)" };
  return { ok: true };
}
