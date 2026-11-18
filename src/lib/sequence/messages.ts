/**
 * What each step of the review sequence says: which approved template, and
 * the value for each {{blank}}. Pure, unit-tested. The template wording
 * itself is in the Templates screen (and src/lib/template-starters.ts).
 */
import { firstName } from "./timing";

export type Step = "checkin" | "review_link" | "reminder" | "thanks";

export const STEP_TEMPLATE: Record<Step, string> = {
  checkin: "visit_checkin",       // Hi {{1}}, this is {{2}} from {{3}}…
  review_link: "review_request",  // Thank you, {{1}}! … experience of {{2}} … {{3}}=link
  reminder: "review_reminder",    // Hi {{1}}, a gentle reminder … {{2}} … {{3}}=link
  thanks: "review_thanks",        // Thank you, {{1}}! … See you again soon at {{2}}…
};

export function stepParams(
  step: Step,
  ctx: { customerName: string | null; ownerFirstName: string | null; businessName: string; link: string | null },
): string[] {
  const who = firstName(ctx.customerName);
  switch (step) {
    case "checkin":
      return [who, ctx.ownerFirstName?.trim() || "the team", ctx.businessName];
    case "review_link":
    case "reminder":
      if (!ctx.link) throw new Error("No review link for this step");
      return [who, ctx.businessName, ctx.link];
    case "thanks":
      return [who, ctx.businessName];
  }
}

/**
 * After the customer replies to the check-in we're inside WhatsApp's 24-hour
 * window, so the review link goes as a plain (free) message, not a template.
 * Same link for everyone, whatever they said: no review gating.
 */
export function replyLinkText(ctx: { customerName: string | null; businessName: string; link: string }): string {
  return `Thank you, ${firstName(ctx.customerName)}! If you have a minute, please share your experience of ${ctx.businessName} on Google. It really helps a local business like ours: ${ctx.link}`;
}

/** Picks the approved template for a step: the customer's language first, then English. */
export function pickTemplate<T extends { name: string; language: string; status: string }>(
  templates: T[],
  step: Step,
  customerLanguage: string | null,
): T | undefined {
  const name = STEP_TEMPLATE[step];
  const approved = templates.filter((t) => t.name === name && t.status === "APPROVED");
  const lang = (l: string) => l.toLowerCase().split("_")[0];
  return (
    approved.find((t) => lang(t.language) === (customerLanguage ?? "ta")) ??
    approved.find((t) => lang(t.language) === "en") ??
    approved[0]
  );
}
