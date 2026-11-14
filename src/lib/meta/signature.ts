import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Meta signs every webhook POST with the app secret:
 *   X-Hub-Signature-256: sha256=<hex HMAC of the raw body>
 * Reject anything that doesn't match, so nobody can fake incoming messages.
 */
export function verifyMetaSignature(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header || !appSecret) return false;
  const [algo, sig] = header.split("=");
  if (algo !== "sha256" || !sig) return false;

  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(sig, "hex");
  const b = Buffer.from(expected, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
