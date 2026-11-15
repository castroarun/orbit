/**
 * Meta's error codes → plain language, with what to do about it.
 * Codes from the WhatsApp Cloud API error reference.
 */
const MESSAGES: Record<number, string> = {
  190: "Meta's access key has expired. In Meta's App Dashboard → WhatsApp → Try it out, generate a new token, update META_SANDBOX_ACCESS_TOKEN in Vercel and redeploy.",
  131030: "This number isn't on the test number's allowed list. Add it under Meta App Dashboard → WhatsApp → Try it out → Recipient (up to 5 numbers).",
  132001: "Meta doesn't have this template in that language, or it isn't approved yet. Refresh templates and check its status.",
  132000: "The number of values filled in doesn't match the template's blanks.",
  132012: "One of the values doesn't fit the template (for example a picture that couldn't be loaded).",
  131047: "Free text only works within 24 hours of the customer's last message. Send a template instead.",
  131026: "WhatsApp couldn't deliver to this number (it may not be on WhatsApp, or hasn't accepted the latest terms).",
  131051: "WhatsApp doesn't support this message type here.",
  131053: "The picture couldn't be uploaded to WhatsApp. Try a smaller JPG or PNG.",
  368: "Meta has temporarily blocked sending from this account for a policy reason. Check WhatsApp Manager for details.",
  4: "Too many requests to Meta in a short time. Wait a minute and try again.",
  80007: "Too many requests to Meta in a short time. Wait a minute and try again.",
  130429: "Sending too fast for this number. Wait a minute and try again.",
  2388023: "This template name was deleted recently and can't be reused for 30 days. Use a new name, e.g. add _v2.",
  2388024: "A template with this name and language already exists. Edit that one, or use a new name.",
};

export function friendlyMetaError(code: number | undefined, fallback: string, subcode?: number): string {
  if (subcode && MESSAGES[subcode]) return MESSAGES[subcode];
  if (code && MESSAGES[code]) return MESSAGES[code];
  if (/access token|session has expired/i.test(fallback)) return MESSAGES[190];
  return fallback;
}
