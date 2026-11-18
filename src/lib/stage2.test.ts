import { describe, expect, it } from "vitest";
import { businessFromForm, missingSetup, reviewLink } from "./business";
import { customerStage, maskPhone } from "./customer-stage";
import { analyzeImport, guessMapping, parseConsent, parseCsv, parseLanguage, parseVisitDate } from "./import-check";

const form = (fields: Record<string, string | string[]>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) for (const x of [v].flat()) f.append(k, x);
  return f;
};

describe("business form", () => {
  it("accepts a minimal business and normalises the owner's number", () => {
    const r = businessFromForm(form({ name: " Sri Sakthi Bakery ", owner_phone: "98400 12345", languages: ["ta", "en"] }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.name).toBe("Sri Sakthi Bakery");
      expect(r.value.owner_phone).toBe("919840012345");
      expect(r.value.status).toBe("pilot");
      expect(r.value.area).toBeNull();
    }
  });
  it("needs a name and a language", () => {
    expect(businessFromForm(form({ languages: "ta" }))).toMatchObject({ ok: false });
    expect(businessFromForm(form({ name: "X" }))).toMatchObject({ ok: false, error: "Choose at least one message language" });
  });
  it("only takes Google review links", () => {
    expect(businessFromForm(form({ name: "X", languages: "ta", google_review_url: "https://g.page/r/CabC123/review" })).ok).toBe(true);
    expect(businessFromForm(form({ name: "X", languages: "ta", google_review_url: "https://search.google.com/local/writereview?placeid=ChIJabc" })).ok).toBe(true);
    expect(businessFromForm(form({ name: "X", languages: "ta", google_review_url: "https://evil.example.com/review" })).ok).toBe(false);
    expect(businessFromForm(form({ name: "X", languages: "ta", google_review_url: "g.page/r/abc" })).ok).toBe(false);
  });
  it("builds the review link from a Place ID and lists missing setup", () => {
    expect(reviewLink({ google_place_id: "ChIJN1t_tDeuEmsRUsoyG83frY4" })).toBe(
      "https://search.google.com/local/writereview?placeid=ChIJN1t_tDeuEmsRUsoyG83frY4",
    );
    expect(reviewLink({ google_review_url: "https://g.page/r/x/review", google_place_id: "ChIJx" })).toBe("https://g.page/r/x/review");
    expect(missingSetup({})).toHaveLength(3);
    expect(missingSetup({ google_place_id: "ChIJN1t_tDeuEmsRUsoyG83frY4", owner_phone: "919840012345" })).toEqual([]);
  });
});

describe("customer stage", () => {
  const c = { consent_at: "2026-11-01", opted_out_at: null };
  it("stop and consent come first", () => {
    expect(customerStage({ consent_at: "x", opted_out_at: "y" }).key).toBe("stopped");
    expect(customerStage({ consent_at: null, opted_out_at: null }).key).toBe("no_consent");
    expect(customerStage(c).key).toBe("new");
  });
  it("follows the review request", () => {
    expect(customerStage(c, { stage: "checkin_sent", link_tapped_at: null }).key).toBe("waiting_reply");
    expect(customerStage(c, { stage: "link_sent", link_tapped_at: null }).key).toBe("not_tapped");
    expect(customerStage(c, { stage: "reminder_sent", link_tapped_at: "t" }).key).toBe("tapped");
  });
  it("masks phone numbers", () => {
    expect(maskPhone("+91 98404 12314")).toBe("+91 98404 •••14");
  });
});

describe("import checks", () => {
  it("guesses columns from Indian spreadsheet headings", () => {
    expect(guessMapping(["Patient Name", "Mobile", "Visit Date", "Language", "WA OK", "Treatment"])).toEqual([
      "name",
      "phone",
      "visit_date",
      "language",
      "consent",
      "skip",
    ]);
    expect(guessMapping(["Customer", "Phone No", "Bill Date"])).toEqual(["name", "phone", "visit_date"]);
  });
  it("reads dates day-first, Excel serials and real dates", () => {
    expect(parseVisitDate("29-10-2026")).toBe("2026-10-29");
    expect(parseVisitDate("5/1/26")).toBe("2026-01-05");
    expect(parseVisitDate("2026-10-29")).toBe("2026-10-29");
    expect(parseVisitDate("29 Oct 2026")).toBe("2026-10-29");
    expect(parseVisitDate(46324)).toBe("2026-10-29");
    expect(parseVisitDate(new Date(2026, 9, 29))).toBe("2026-10-29");
    expect(parseVisitDate("31-02-2026")).toBeNull();
    expect(parseVisitDate("soon")).toBeNull();
  });
  it("reads languages and consent", () => {
    expect(parseLanguage("Tamil")).toBe("ta");
    expect(parseLanguage("தமிழ்")).toBe("ta");
    expect(parseLanguage("ENG")).toBe("en");
    expect(parseLanguage("Hindi")).toBeNull();
    expect(parseConsent("Yes")).toBe(true);
    expect(parseConsent("no")).toBe(false);
    expect(parseConsent("")).toBeNull();
  });
  it("cleans, merges duplicates and keeps consent strict", () => {
    const rows = [
      ["Priya", "9840412314", "29-10-2026", "Yes"],
      ["", "+91 98404 12314", "30-10-2026", "Yes"], // duplicate, later visit
      ["Karthik", "09940162162", "", "no"],
      ["Bad", "12345", "", "yes"],
      ["Future", "9876543210", "01-01-2099", "yes"],
      ["", "", "", ""],
    ];
    const r = analyzeImport(rows, ["name", "phone", "visit_date", "consent"], { consentForAll: true, today: "2026-11-18" });
    expect(r.ready.map((x) => x.phone)).toEqual(["919840412314", "919876543210"]);
    expect(r.ready[0]).toMatchObject({ name: "Priya", visitDate: "2026-10-30", consent: true });
    expect(r.saveOnly).toHaveLength(1); // Karthik said no, even with "everyone agreed"
    expect(r.duplicates).toBe(1);
    expect(r.invalid).toHaveLength(1);
    expect(r.futureDates).toBe(1);
    expect(r.fixedNumbers).toBe(3); // 91 added or leading 0 dropped; "+91 98404…" only had spaces
  });
  it("without a consent column, only the owner's confirmation gives consent", () => {
    const rows = [["A", "9840412314"]];
    expect(analyzeImport(rows, ["name", "phone"], { consentForAll: false }).saveOnly).toHaveLength(1);
    expect(analyzeImport(rows, ["name", "phone"], { consentForAll: true }).ready).toHaveLength(1);
  });
  it("parses CSV with quotes and semicolons", () => {
    expect(parseCsv('Name,Phone\r\n"Iyer, Rahul",98841 22355\n\n')).toEqual([
      ["Name", "Phone"],
      ["Iyer, Rahul", "98841 22355"],
    ]);
    expect(parseCsv("a;b\n1;2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

import { makeIngestKey, parseIncomingVisit } from "./visits-in";

describe("incoming visits (billing app / website)", () => {
  const now = new Date("2026-11-18T10:00:00Z");
  it("accepts a minimal order and normalises the number", () => {
    const r = parseIncomingVisit({ phone: "98404 12314", consent: true, order_id: "INV-1" }, now);
    expect(r).toMatchObject({ ok: true, value: { phone: "919840412314", consent: true, orderId: "INV-1", source: "billing" } });
  });
  it("treats missing consent as no consent", () => {
    const r = parseIncomingVisit({ phone: "9840412314" }, now);
    expect(r.ok && r.value.consent).toBe(false);
  });
  it("rejects bad numbers, future dates and odd consent values", () => {
    expect(parseIncomingVisit({ phone: "123" }, now).ok).toBe(false);
    expect(parseIncomingVisit({ phone: "9840412314", visited_at: "2026-11-19T10:00:00Z" }, now).ok).toBe(false);
    expect(parseIncomingVisit({ phone: "9840412314", consent: "yes" }, now).ok).toBe(false);
    expect(parseIncomingVisit(null, now).ok).toBe(false);
  });
  it("makes long private keys", () => {
    expect(makeIngestKey()).toMatch(/^vk_[a-z2-9]{32}$/);
  });
});
