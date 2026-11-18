/**
 * Visits arriving from outside: a billing app or a client website sends one
 * order or bill. Checks the payload in plain words. Pure, unit-tested.
 *
 * POST /api/visits  (Authorization: Bearer <business key>)
 * {
 *   "phone": "98404 12314",          required
 *   "name": "Priya Raghavan",         optional
 *   "consent": true,                  required to message: did they agree to WhatsApp messages?
 *   "visited_at": "2026-11-18T13:05:00+05:30",  optional, default now
 *   "order_id": "INV-2041",           optional, stops the same order counting twice
 *   "language": "ta" | "en",          optional
 *   "source": "billing" | "website"   optional, default "billing"
 * }
 */
import { normalizePhone } from "./phone";

export type IncomingVisit = {
  phone: string;
  name: string | null;
  consent: boolean;
  visitedAt: string;
  orderId: string | null;
  language: "ta" | "en" | null;
  source: "billing" | "website";
};

export function parseIncomingVisit(body: unknown, now = new Date()): { ok: true; value: IncomingVisit } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Send a JSON object" };
  const b = body as Record<string, unknown>;

  const phone = normalizePhone(String(b.phone ?? ""));
  if (!phone.ok) return { ok: false, error: `phone: ${phone.reason}` };

  let visitedAt = now;
  if (b.visited_at !== undefined && b.visited_at !== null && b.visited_at !== "") {
    const d = new Date(String(b.visited_at));
    if (isNaN(d.getTime())) return { ok: false, error: "visited_at: use a date like 2026-11-18T13:05:00+05:30" };
    if (d.getTime() > now.getTime() + 5 * 60_000) return { ok: false, error: "visited_at can't be in the future" };
    visitedAt = d;
  }
  if (b.consent !== undefined && typeof b.consent !== "boolean") return { ok: false, error: "consent: true or false" };

  const text = (v: unknown, max: number) => {
    const s = String(v ?? "").trim();
    return s ? s.slice(0, max) : null;
  };
  const lang = String(b.language ?? "").toLowerCase();
  return {
    ok: true,
    value: {
      phone: phone.phone,
      name: text(b.name, 120),
      consent: b.consent === true,
      visitedAt: visitedAt.toISOString(),
      orderId: text(b.order_id, 100),
      language: lang === "ta" || lang === "en" ? lang : null,
      source: b.source === "website" ? "website" : "billing",
    },
  };
}

/** A long random key: 32 characters from a 32-letter alphabet (160 bits). */
export function makeIngestKey(random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))) {
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
  return "vk_" + Array.from(random(32), (x) => alphabet[x % alphabet.length]).join("");
}
