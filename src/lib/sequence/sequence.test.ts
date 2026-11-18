import { describe, expect, it } from "vitest";
import { pickTemplate, replyLinkText, stepParams } from "./messages";
import { DELAYS, firstName, isPreviewBot, makeLinkCode, nextAllowedTime } from "./timing";

const quiet = { start: "20:00", end: "09:00", timeZone: "Asia/Kolkata" };

describe("timing", () => {
  it("keeps daytime steps, moves night steps to 9:00 India time", () => {
    const day = new Date("2026-11-18T08:30:00Z"); // 14:00 IST
    expect(nextAllowedTime(day, quiet)).toEqual(day);
    const night = new Date("2026-11-18T16:00:00Z"); // 21:30 IST
    expect(nextAllowedTime(night, quiet).toISOString()).toBe("2026-11-19T03:30:00.000Z"); // 09:00 IST
  });
  it("test mode is minutes, real mode follows the playbook", () => {
    expect(DELAYS.real.checkin).toBe(30 * 60_000);
    expect(DELAYS.real.reminder).toBe(48 * 3600_000);
    expect(DELAYS.test.checkin).toBe(60_000);
  });
  it("first names and link codes", () => {
    expect(firstName("Priya Raghavan")).toBe("Priya");
    expect(firstName("  ")).toBe("there");
    expect(firstName(null)).toBe("there");
    const code = makeLinkCode();
    expect(code).toMatch(/^[a-z2-9]{6}$/);
    expect(code).not.toMatch(/[01lo]/);
  });
  it("preview fetchers aren't taps", () => {
    expect(isPreviewBot("WhatsApp/2.24.1 A")).toBe(true);
    expect(isPreviewBot("facebookexternalhit/1.1")).toBe(true);
    expect(isPreviewBot("")).toBe(true);
    expect(isPreviewBot("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/131 Mobile Safari/537.36")).toBe(false);
  });
});

describe("messages", () => {
  const ctx = { customerName: "Priya R", ownerFirstName: "Ravi", businessName: "Sri Sakthi Bakery", link: "https://x.app/r/abc234" };
  it("fills each template's blanks in order", () => {
    expect(stepParams("checkin", ctx)).toEqual(["Priya", "Ravi", "Sri Sakthi Bakery"]);
    expect(stepParams("review_link", ctx)).toEqual(["Priya", "Sri Sakthi Bakery", "https://x.app/r/abc234"]);
    expect(stepParams("thanks", ctx)).toEqual(["Priya", "Sri Sakthi Bakery"]);
    expect(() => stepParams("reminder", { ...ctx, link: null })).toThrow();
  });
  it("same link for everyone after a reply", () => {
    expect(replyLinkText(ctx)).toContain("https://x.app/r/abc234");
  });
  it("prefers the customer's language, then English, approved only", () => {
    const t = [
      { name: "review_request", language: "en", status: "APPROVED" },
      { name: "review_request", language: "ta", status: "PENDING" },
      { name: "visit_checkin", language: "en_US", status: "APPROVED" },
    ];
    expect(pickTemplate(t, "review_link", "ta")?.language).toBe("en");
    expect(pickTemplate(t, "checkin", "en")?.language).toBe("en_US");
    expect(pickTemplate(t, "thanks", "en")).toBeUndefined();
  });
});
