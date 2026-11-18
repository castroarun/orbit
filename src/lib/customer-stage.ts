/**
 * "Where is this customer?" in one word, for the Customers list and filters.
 * Derived from the customer row and their latest review request.
 */

export type Tone = "ok" | "wait" | "info" | "bad" | "neu";

export type StageInfo = { key: StageKey; label: string; tone: Tone };

export type StageKey =
  | "stopped"
  | "no_consent"
  | "new"
  | "waiting_reply"
  | "not_tapped"
  | "tapped"
  | "reminded"
  | "done";

export const STAGE_FILTERS: { key: StageKey | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "new", label: "Not messaged yet" },
  { key: "waiting_reply", label: "Waiting for reply" },
  { key: "not_tapped", label: "Not tapped yet" },
  { key: "tapped", label: "Tapped" },
  { key: "no_consent", label: "No consent" },
  { key: "stopped", label: "Stopped" },
];

export function customerStage(
  c: { consent_at: string | null; opted_out_at: string | null },
  latest?: { stage: string; link_tapped_at: string | null } | null,
): StageInfo {
  if (c.opted_out_at) return { key: "stopped", label: "Asked to stop", tone: "neu" };
  if (!c.consent_at) return { key: "no_consent", label: "No consent, saved only", tone: "neu" };
  if (!latest) return { key: "new", label: "Not messaged yet", tone: "neu" };
  if (latest.link_tapped_at || latest.stage === "tapped" || latest.stage === "thanked")
    return { key: "tapped", label: "Tapped link", tone: "ok" };
  switch (latest.stage) {
    case "scheduled":
      return { key: "new", label: "Check-in scheduled", tone: "info" };
    case "checkin_sent":
      return { key: "waiting_reply", label: "Waiting for reply", tone: "info" };
    case "replied":
    case "no_reply":
    case "link_sent":
      return { key: "not_tapped", label: "Not tapped yet", tone: "wait" };
    case "reminder_sent":
      return { key: "reminded", label: "Reminder sent", tone: "neu" };
    default:
      return { key: "done", label: "Finished", tone: "neu" };
  }
}

/** Masks the middle of a phone number for lists: +91 98404 •••14 */
export function maskPhone(formatted: string) {
  return formatted.replace(/(\d{3})(?=\d{2}$)/, "•••");
}

/** The four messages of a review request, in order, for the step tracker. */
export const STEP_LABELS = {
  send_checkin: "Check-in",
  send_review_link: "Review link",
  send_reminder: "Reminder",
  send_thanks: "Thank-you",
  expire: "Close the request",
} as const;

/** Stages in which messages are still going out (screens refresh themselves). */
export const RUNNING_STAGES = ["scheduled", "checkin_sent", "replied", "no_reply", "link_sent", "reminder_sent", "tapped"];

/** "Step 2 of 3"-style position for the list: check-in → review link → reminder/thank-you. */
export function stepPosition(stage: string): string | null {
  switch (stage) {
    case "scheduled":
      return "Step 1 of 3 next";
    case "checkin_sent":
    case "replied":
    case "no_reply":
      return "1 of 3 sent";
    case "link_sent":
      return "2 of 3 sent";
    case "reminder_sent":
      return "3 of 3 sent";
    case "tapped":
    case "thanked":
      return "Done: tapped";
    default:
      return null;
  }
}
