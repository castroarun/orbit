/**
 * Business details: validating the Add/Edit business form and working out the
 * Google "write a review" link. Pure functions, unit-tested.
 */
import { normalizePhone } from "./phone";

export const BUSINESS_STATUSES = { pilot: "Pilot", active: "Active", paused: "Paused", ended: "Ended" } as const;
export type BusinessStatus = keyof typeof BUSINESS_STATUSES;

export const SENDING_MODES = {
  wame: "One-tap sending",
  meta: "Automatic (Meta)",
  provider: "Backup provider",
} as const;

/**
 * The link customers tap to review. Prefer the owner's own share link from
 * Google ("Ask for reviews" → g.page/r/…/review); otherwise build it from the
 * Place ID, which opens the same review box.
 */
export function reviewLink(b: { google_review_url?: string | null; google_place_id?: string | null }): string | null {
  if (b.google_review_url) return b.google_review_url;
  if (b.google_place_id) return `https://search.google.com/local/writereview?placeid=${encodeURIComponent(b.google_place_id)}`;
  return null;
}

export type BusinessInput = {
  name: string;
  area: string | null;
  kind: string | null;
  owner_first_name: string | null;
  owner_phone: string | null;
  google_review_url: string | null;
  google_place_id: string | null;
  languages: string[];
  status: BusinessStatus;
  plan: string | null;
  notes: string | null;
};

const text = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  return s ? s : null;
};

/** Reads and checks the business form. Returns the clean row or the first problem in plain words. */
export function businessFromForm(form: FormData): { ok: true; value: BusinessInput } | { ok: false; error: string } {
  const name = text(form.get("name"));
  if (!name) return { ok: false, error: "Business name is needed" };

  let owner_phone: string | null = null;
  const rawOwner = text(form.get("owner_phone"));
  if (rawOwner) {
    const p = normalizePhone(rawOwner);
    if (!p.ok) return { ok: false, error: `Owner's WhatsApp number: ${p.reason}` };
    owner_phone = p.phone;
  }

  const google_review_url = text(form.get("google_review_url"));
  if (google_review_url) {
    let url: URL;
    try {
      url = new URL(google_review_url);
    } catch {
      return { ok: false, error: "Google review link must be a full link starting with https://" };
    }
    if (url.protocol !== "https:") return { ok: false, error: "Google review link must start with https://" };
    const host = url.hostname.replace(/^www\./, "");
    const googleish = /(^|\.)google\.[a-z.]+$/.test(host) || host === "g.page" || host === "maps.app.goo.gl" || host === "goo.gl";
    if (!googleish) return { ok: false, error: "That doesn't look like a Google link. Use the owner's 'Ask for reviews' link from Google" };
  }

  const google_place_id = text(form.get("google_place_id"));
  if (google_place_id && !/^[A-Za-z0-9_-]{10,}$/.test(google_place_id))
    return { ok: false, error: "Google Place ID looks wrong: it's one long code like ChIJ… with no spaces" };

  const languages = form.getAll("languages").map(String).filter((l) => l === "ta" || l === "en");
  if (!languages.length) return { ok: false, error: "Choose at least one message language" };

  const statusRaw = String(form.get("status") ?? "pilot");
  const status = (statusRaw in BUSINESS_STATUSES ? statusRaw : "pilot") as BusinessStatus;

  return {
    ok: true,
    value: {
      name,
      area: text(form.get("area")),
      kind: text(form.get("kind")),
      owner_first_name: text(form.get("owner_first_name")),
      owner_phone,
      google_review_url,
      google_place_id,
      languages,
      status,
      plan: text(form.get("plan")),
      notes: text(form.get("notes")),
    },
  };
}

/** Setup steps still missing for a business, in plain words (shown on Overview and the business page). */
export function missingSetup(b: { google_review_url?: string | null; google_place_id?: string | null; owner_phone?: string | null }) {
  const out: string[] = [];
  if (!reviewLink(b)) out.push("Google review link");
  if (!b.google_place_id) out.push("Google Place ID (for daily rating tracking)");
  if (!b.owner_phone) out.push("Owner's WhatsApp number (for complaint alerts)");
  return out;
}
