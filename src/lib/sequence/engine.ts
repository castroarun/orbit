import "server-only";
/**
 * The review sequence (review-engine.md):
 *   visit → check-in (no link) → review link (after a reply, or after a wait)
 *   → one reminder if not tapped → thank-you when tapped.
 * Each step is a row in orbit.jobs; the once-a-minute tick runs due ones.
 * All sending goes through sendMessage (consent, STOP and quiet hours are
 * checked there). In test mode a business's messages go to its test phone
 * through our Meta test number.
 */
import { reviewLink } from "../business";
import { fillBlanks } from "../meta/template-view";
import { ensureSandboxBusiness } from "../sandbox";
import { sendMessage } from "../send";
import { supabaseAdmin } from "../supabase/server";
import { pickTemplate, replyLinkText, STEP_TEMPLATE, stepParams, type Step } from "./messages";
import { delaysFor, isPreviewBot, makeLinkCode, nextAllowedTime, REASK_AFTER_DAYS, type Quiet } from "./timing";

type Db = ReturnType<typeof supabaseAdmin>;

type Business = {
  id: string;
  name: string;
  owner_first_name: string | null;
  google_review_url: string | null;
  google_place_id: string | null;
  messaging_mode: "wame" | "meta" | "provider";
  wa_phone_number_id: string | null;
  quiet_start: string;
  quiet_end: string;
  timezone: string;
  test_mode: boolean;
  test_phone: string | null;
  is_sandbox: boolean;
};
const BUSINESS_FIELDS =
  "id, name, owner_first_name, google_review_url, google_place_id, messaging_mode, wa_phone_number_id, quiet_start, quiet_end, timezone, test_mode, test_phone, is_sandbox";

type JobType = "send_checkin" | "send_review_link" | "send_reminder" | "send_thanks" | "expire";
const JOB_STEP: Partial<Record<JobType, Step>> = {
  send_checkin: "checkin",
  send_review_link: "review_link",
  send_reminder: "reminder",
  send_thanks: "thanks",
};

const quietOf = (b: Business): Quiet => ({ start: b.quiet_start, end: b.quiet_end, timeZone: b.timezone });

/** Public address for tracked links. Our own domain replaces this once registered. */
export function linkBase() {
  if (process.env.PUBLIC_LINK_BASE) return process.env.PUBLIC_LINK_BASE.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return "http://localhost:3000";
}

/** Can this business run the sequence automatically right now? Plain-words reason if not. */
export function sequenceReadiness(b: Pick<Business, "test_mode" | "test_phone" | "messaging_mode" | "google_review_url" | "google_place_id">) {
  if (!reviewLink(b)) return { ok: false as const, reason: "Add the Google review link first (Edit business)." };
  if (b.test_mode) {
    if (!b.test_phone) return { ok: false as const, reason: "Test mode needs a test phone number (Edit business)." };
    return { ok: true as const };
  }
  if (b.messaging_mode !== "meta")
    return { ok: false as const, reason: "Automatic sending starts once the business connects WhatsApp through Meta. Use test mode to try it now." };
  return { ok: true as const };
}

async function queueJob(db: Db, b: Business, requestId: string, type: JobType, delayMs: number) {
  const runAt = nextAllowedTime(new Date(Date.now() + delayMs), quietOf(b));
  const { error } = await db.from("jobs").insert({
    business_id: b.id,
    review_request_id: requestId,
    type,
    run_at: runAt.toISOString(),
    payload: { review_request_id: requestId },
  });
  if (error) throw error;
  return runAt;
}

async function cancelJobs(db: Db, requestId: string, types?: JobType[]) {
  let q = db.from("jobs").update({ state: "cancelled" }).eq("review_request_id", requestId).eq("state", "queued");
  if (types) q = q.in("type", types);
  await q;
}

/**
 * Starts a review request for a visit. Returns a plain-words problem, or null.
 * Safe to call twice for the same visit (one request per visit).
 */
export async function startReviewRequest(visitId: string): Promise<{ error: string } | { requestId: string; firstStepAt: Date }> {
  const db = supabaseAdmin();
  const { data: visit } = await db
    .from("visits")
    .select("id, business_id, customer_id, customers(name, consent_at, opted_out_at, last_review_ask_at)")
    .eq("id", visitId)
    .single();
  if (!visit) return { error: "Visit not found" };
  const customer = visit.customers as unknown as { name: string | null; consent_at: string | null; opted_out_at: string | null; last_review_ask_at: string | null };
  const { data: b } = await db.from("businesses").select(BUSINESS_FIELDS).eq("id", visit.business_id).single<Business>();
  if (!b) return { error: "Business not found" };

  const ready = sequenceReadiness(b);
  if (!ready.ok) return { error: ready.reason };
  if (customer.opted_out_at) return { error: "This customer asked to stop messages." };
  if (!customer.consent_at) return { error: "No consent recorded for this customer, so we can't message them." };
  if (!b.test_mode && customer.last_review_ask_at) {
    const days = (Date.now() - new Date(customer.last_review_ask_at).getTime()) / 86_400_000;
    if (days < REASK_AFTER_DAYS) return { error: `Already asked for a review ${Math.floor(days)} days ago; we wait ${REASK_AFTER_DAYS} days before asking again.` };
  }
  const { data: open } = await db
    .from("review_requests")
    .select("id")
    .eq("customer_id", visit.customer_id)
    .in("stage", ["scheduled", "checkin_sent", "replied", "no_reply", "link_sent"])
    .limit(1);
  if (open?.length) return { error: "A review request is already running for this customer." };

  const { data: rr, error } = await db
    .from("review_requests")
    .insert({ business_id: b.id, visit_id: visit.id, customer_id: visit.customer_id, stage: "scheduled" })
    .select("id")
    .single();
  if (error) return { error: error.code === "23505" ? "This visit already has a review request." : error.message };
  const firstStepAt = await queueJob(db, b, rr.id, "send_checkin", delaysFor(b.test_mode).checkin);
  return { requestId: rr.id, firstStepAt };
}

/** Where a business's messages actually go: itself, or (test mode) our test number to the test phone. */
async function channelFor(b: Business, customerPhone: string) {
  if (b.test_mode) {
    const sandbox = await ensureSandboxBusiness();
    return {
      // Logged under the real business; sent with the sandbox number and token.
      sender: { ...b, is_sandbox: true, messaging_mode: "meta" as const, wa_phone_number_id: sandbox.wa_phone_number_id },
      templateOwnerId: sandbox.id as string,
      to: b.test_phone!,
    };
  }
  return { sender: b, templateOwnerId: b.id, to: customerPhone };
}

async function ensureLink(db: Db, b: Business, requestId: string) {
  const { data: existing } = await db.from("short_links").select("code").eq("review_request_id", requestId).maybeSingle();
  if (existing) return `${linkBase()}/r/${existing.code}`;
  const target = reviewLink(b);
  if (!target) throw new Error("No Google review link for this business");
  for (let i = 0; i < 5; i++) {
    const code = makeLinkCode();
    const { error } = await db.from("short_links").insert({ code, business_id: b.id, review_request_id: requestId, target_url: target });
    if (!error) return `${linkBase()}/r/${code}`;
    if (error.code !== "23505") throw error;
  }
  throw new Error("Couldn't make a unique link code");
}

type RunOutcome = "done" | "skipped" | { retryAt: Date; reason: string } | { failed: string };

async function runJob(db: Db, job: { id: number; type: JobType; review_request_id: string | null }): Promise<RunOutcome> {
  if (!job.review_request_id) return { failed: "Job has no review request" };
  const { data: rr } = await db
    .from("review_requests")
    .select("id, stage, link_tapped_at, business_id, customers(id, name, phone, language, consent_at, opted_out_at)")
    .eq("id", job.review_request_id)
    .single();
  if (!rr) return { failed: "Review request not found" };
  const c = rr.customers as unknown as { id: string; name: string | null; phone: string; language: string | null; consent_at: string | null; opted_out_at: string | null };
  const { data: b } = await db.from("businesses").select(BUSINESS_FIELDS).eq("id", rr.business_id).single<Business>();
  if (!b) return { failed: "Business not found" };

  if (["stopped", "expired", "thanked"].includes(rr.stage)) return "skipped";
  if (c.opted_out_at) {
    await db.from("review_requests").update({ stage: "stopped", stop_reason: "customer asked", completed_at: new Date().toISOString() }).eq("id", rr.id);
    return "skipped";
  }

  if (job.type === "expire") {
    if (!rr.link_tapped_at) await db.from("review_requests").update({ stage: "expired", completed_at: new Date().toISOString() }).eq("id", rr.id);
    return "done";
  }
  const step = JOB_STEP[job.type]!;
  // A tap ends the asking: no review link or reminder after it.
  if ((step === "review_link" || step === "reminder") && rr.link_tapped_at) return "skipped";
  if (step === "review_link" && rr.stage !== "checkin_sent") return "skipped"; // already sent after a reply

  const quiet = quietOf(b);
  const allowedAt = nextAllowedTime(new Date(), quiet);
  if (allowedAt.getTime() > Date.now()) return { retryAt: allowedAt, reason: "Quiet hours" };

  const ch = await channelFor(b, c.phone);
  const { data: templates } = await db.from("templates").select("name, language, status, body").eq("business_id", ch.templateOwnerId);
  const template = pickTemplate(templates ?? [], step, c.language);
  if (!template) return { failed: `Template "${STEP_TEMPLATE[step]}" isn't approved by Meta yet` };

  const link = step === "review_link" || step === "reminder" ? await ensureLink(db, b, rr.id) : null;
  const params = stepParams(step, { customerName: c.name, ownerFirstName: b.owner_first_name, businessName: b.name, link });
  const result = await sendMessage({
    business: ch.sender,
    message: {
      kind: "template",
      to: ch.to,
      templateName: template.name,
      language: template.language,
      bodyParams: params,
      previewText: fillBlanks(template.body, params),
    },
    customerId: c.id,
    reviewRequestId: rr.id,
  });
  if (result.status === "failed") return { failed: result.error };

  const now = new Date().toISOString();
  const d = delaysFor(b.test_mode);
  if (step === "checkin") {
    await db.from("review_requests").update({ stage: "checkin_sent" }).eq("id", rr.id);
    await queueJob(db, b, rr.id, "send_review_link", d.reviewLink);
  } else if (step === "review_link") {
    await db.from("review_requests").update({ stage: "link_sent" }).eq("id", rr.id);
    await db.from("customers").update({ last_review_ask_at: now }).eq("id", c.id);
    await queueJob(db, b, rr.id, "send_reminder", d.reminder);
  } else if (step === "reminder") {
    await db.from("review_requests").update({ stage: "reminder_sent" }).eq("id", rr.id);
    await queueJob(db, b, rr.id, "expire", d.expire);
  } else if (step === "thanks") {
    await db.from("review_requests").update({ stage: "thanked", completed_at: now }).eq("id", rr.id);
  }
  return "done";
}

/** Runs every due job (called by the once-a-minute tick, or the "Run due steps now" button). */
export async function runDueJobs(limit = 25) {
  const db = supabaseAdmin();
  const { data: due } = await db
    .from("jobs")
    .select("id, type, review_request_id, attempts")
    .eq("state", "queued")
    .lte("run_at", new Date().toISOString())
    .order("run_at")
    .limit(limit);
  const results: { id: number; outcome: string }[] = [];
  for (const job of due ?? []) {
    // Claim it, so two ticks never run the same job.
    const { data: claimed } = await db.from("jobs").update({ state: "running", attempts: job.attempts + 1 }).eq("id", job.id).eq("state", "queued").select("id");
    if (!claimed?.length) continue;
    let outcome: RunOutcome;
    try {
      outcome = await runJob(db, job as { id: number; type: JobType; review_request_id: string | null });
    } catch (e) {
      outcome = { failed: e instanceof Error ? e.message : String(e) };
    }
    if (outcome === "done" || outcome === "skipped") {
      await db.from("jobs").update({ state: "done", last_error: outcome === "skipped" ? "skipped" : null }).eq("id", job.id);
    } else if ("retryAt" in outcome) {
      await db.from("jobs").update({ state: "queued", run_at: outcome.retryAt.toISOString(), last_error: outcome.reason }).eq("id", job.id);
    } else if (job.attempts + 1 < 3 && !/isn't approved/.test(outcome.failed)) {
      await db.from("jobs").update({ state: "queued", run_at: new Date(Date.now() + 5 * 60_000).toISOString(), last_error: outcome.failed }).eq("id", job.id);
    } else {
      await db.from("jobs").update({ state: "failed", last_error: outcome.failed }).eq("id", job.id);
    }
    results.push({ id: job.id, outcome: typeof outcome === "string" ? outcome : "retryAt" in outcome ? `later: ${outcome.reason}` : `failed: ${outcome.failed}` });
  }
  return results;
}

/** A tap on /r/<code>. Returns where to send the person. Preview bots are logged but don't count. */
export async function recordTap(code: string, userAgent: string | null): Promise<string | null> {
  const db = supabaseAdmin();
  const { data: link } = await db.from("short_links").select("code, business_id, review_request_id, target_url").eq("code", code).maybeSingle();
  if (!link) return null;
  const bot = isPreviewBot(userAgent);
  await db.from("link_taps").insert({ code, user_agent: `${bot ? "[preview] " : ""}${(userAgent ?? "").slice(0, 300)}` });
  if (bot || !link.review_request_id) return link.target_url;

  const { data: rr } = await db.from("review_requests").select("id, stage, link_tapped_at").eq("id", link.review_request_id).single();
  if (rr && !rr.link_tapped_at && !["stopped", "expired"].includes(rr.stage)) {
    // Only the first tap moves things on; the thank-you goes once.
    const { data: first } = await db
      .from("review_requests")
      .update({ link_tapped_at: new Date().toISOString(), stage: "tapped" })
      .eq("id", rr.id)
      .is("link_tapped_at", null)
      .select("id");
    if (first?.length) {
      await cancelJobs(db, rr.id, ["send_reminder", "expire", "send_review_link"]);
      const { data: b } = await db.from("businesses").select(BUSINESS_FIELDS).eq("id", link.business_id).single<Business>();
      if (b) await queueJob(db, b, rr.id, "send_thanks", 0);
    }
  }
  return link.target_url;
}

/**
 * The customer wrote back after the check-in: send the review link right
 * away, as a free message inside WhatsApp's 24-hour window. Same link for
 * everyone, whatever they wrote (complaint alerts come in stage 3).
 * Returns true if a review request moved on.
 */
export async function onCustomerReply(fromPhone: string): Promise<boolean> {
  const db = supabaseAdmin();
  // Real customers by their number; test businesses by their test phone.
  const { data: candidates } = await db
    .from("review_requests")
    .select("id, business_id, customers!inner(id, name, phone), businesses!inner(test_mode, test_phone)")
    .eq("stage", "checkin_sent")
    .order("started_at", { ascending: false })
    .limit(50);
  const match = (candidates ?? []).find((r) => {
    const c = r.customers as unknown as { phone: string };
    const b = r.businesses as unknown as { test_mode: boolean; test_phone: string | null };
    return b.test_mode ? b.test_phone === fromPhone : c.phone === fromPhone;
  });
  if (!match) return false;

  const { data: moved } = await db.from("review_requests").update({ stage: "replied" }).eq("id", match.id).eq("stage", "checkin_sent").select("id");
  if (!moved?.length) return false;
  await cancelJobs(db, match.id, ["send_review_link"]);

  const { data: b } = await db.from("businesses").select(BUSINESS_FIELDS).eq("id", match.business_id).single<Business>();
  const c = match.customers as unknown as { id: string; name: string | null; phone: string };
  if (!b) return false;
  const link = await ensureLink(db, b, match.id);
  const ch = await channelFor(b, c.phone);
  const result = await sendMessage({
    business: ch.sender,
    message: { kind: "text", to: ch.to, text: replyLinkText({ customerName: c.name, businessName: b.name, link }) },
    customerId: c.id,
    reviewRequestId: match.id,
  });
  if (result.status === "failed") {
    // Fall back to the template a minute later.
    await db.from("review_requests").update({ stage: "checkin_sent" }).eq("id", match.id);
    await queueJob(db, b, match.id, "send_review_link", 60_000);
    return false;
  }
  await db.from("review_requests").update({ stage: "link_sent" }).eq("id", match.id);
  await db.from("customers").update({ last_review_ask_at: new Date().toISOString() }).eq("id", c.id);
  await queueJob(db, b, match.id, "send_reminder", delaysFor(b.test_mode).reminder);
  return true;
}
