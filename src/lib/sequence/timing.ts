/**
 * When each step of the review sequence happens (review-engine.md).
 * Test mode uses minutes so the whole flow can be watched in one sitting.
 * Pure functions, unit-tested.
 */
import { isQuietHours } from "../messaging/rules";

const MIN = 60_000;
const HOUR = 60 * MIN;

export const DELAYS = {
  real: {
    checkin: 30 * MIN,      // after the visit
    reviewLink: 2 * HOUR,   // after the check-in, if they don't reply first
    reminder: 48 * HOUR,    // after the review link, only if not tapped
    expire: 7 * 24 * HOUR,  // after the reminder: request closes
  },
  test: {
    checkin: 1 * MIN,
    reviewLink: 2 * MIN,
    reminder: 3 * MIN,
    expire: 10 * MIN,
  },
} as const;

export type StepDelays = (typeof DELAYS)["real"] | (typeof DELAYS)["test"];
export const delaysFor = (testMode: boolean): StepDelays => (testMode ? DELAYS.test : DELAYS.real);

/** Ask the same customer for a review at most once in this many days (test mode ignores it). */
export const REASK_AFTER_DAYS = 90;

export type Quiet = { start: string; end: string; timeZone: string };

/**
 * The first moment at or after `at` that is outside quiet hours.
 * Steps falling at night move to the morning (9:00 by default), never skipped.
 */
export function nextAllowedTime(at: Date, quiet: Quiet): Date {
  if (!isQuietHours(at, quiet)) return at;
  // Walk forward in 5-minute steps (at most ~13 hours of quiet), then snap to the minute.
  let t = new Date(Math.ceil(at.getTime() / (5 * MIN)) * 5 * MIN);
  for (let i = 0; i < 24 * 12 && isQuietHours(t, quiet); i++) t = new Date(t.getTime() + 5 * MIN);
  return t;
}

/** "Priya Raghavan" → "Priya"; nothing usable → "there" (Meta rejects empty values). */
export function firstName(name: string | null | undefined): string {
  const first = (name ?? "").trim().split(/\s+/)[0] ?? "";
  return first.length >= 2 ? first : "there";
}

/** Link-preview fetchers (WhatsApp, Facebook, Google…) open links too; those aren't customer taps. */
export function isPreviewBot(userAgent: string | null | undefined): boolean {
  const ua = (userAgent ?? "").toLowerCase();
  if (!ua) return true;
  return /(whatsapp|facebookexternalhit|facebot|meta-externalagent|bot\b|crawler|spider|preview|slurp|curl|wget|python-requests|headless)/.test(ua);
}

const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789"; // no 0/o/1/l, easy to read aloud

/** Short, random, hard-to-guess link code (6 chars ≈ 1 billion combinations). */
export function makeLinkCode(random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  return Array.from(random(6), (b) => ALPHABET[b % ALPHABET.length]).join("");
}

/** When a customer last asked at `startedAt` can be asked again; null if they can be asked now. */
export function nextAskAllowedAt(startedAt: string, now: number = Date.now()): Date | null {
  const at = new Date(new Date(startedAt).getTime() + REASK_AFTER_DAYS * 86_400_000);
  return at.getTime() > now ? at : null;
}
