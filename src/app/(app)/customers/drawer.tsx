import Link from "next/link";
import { addVisit, recordConsent, resolveCase, runDueNow, simulateReply, startReview, stopMessages, updateCustomer } from "../../actions-crm";
import { CONSENT_SOURCES } from "@/lib/consent";
import type { StageInfo } from "@/lib/customer-stage";
import { todayIST } from "@/lib/dates";
import { formatPhone } from "@/lib/phone";
import { sequenceReadiness } from "@/lib/sequence/engine";
import { nextAskAllowedAt } from "@/lib/sequence/timing";
import { supabaseForUser } from "@/lib/supabase/server";
import { PendingButton } from "../pending-button";
import { Pill, when } from "../ui";

type Customer = {
  id: string;
  name: string | null;
  phone: string;
  language: string | null;
  consent_at: string | null;
  consentLabel: string;
  opted_out_at: string | null;
  created_at: string;
  stage: StageInfo;
};

type Event = { at: string; dateOnly?: boolean; title: string; detail?: string; body?: string | null; dir?: "in" | "out"; tone: "grey" | "blue" | "green" };

const STAGE_TEXT: Record<string, string> = {
  scheduled: "Check-in scheduled",
  checkin_sent: "Check-in sent, waiting for a reply",
  replied: "Replied",
  no_reply: "No reply",
  link_sent: "Review link sent, not tapped yet",
  reminder_sent: "Reminder sent, not tapped",
  tapped: "Tapped the review link",
  thanked: "Tapped and thanked: done",
  stopped: "Stopped",
  expired: "Closed without a tap",
  on_hold: "Paused: the customer wrote back, waiting for the owner",
  followup_sent: "Apology with the review link sent, not tapped yet",
};
const JOB_TEXT: Record<string, string> = {
  send_checkin: "Check-in message",
  send_review_link: "Review link",
  send_reminder: "Gentle reminder",
  send_thanks: "Thank-you",
  send_followup: "Apology with review link",
  expire: "Close the request",
};

type BusinessForSequence = Parameters<typeof sequenceReadiness>[0] & { test_mode: boolean; test_phone: string | null };

const VISIT_SOURCE: Record<string, string> = { staff: "Marked by staff", import: "From imported list", billing: "From billing", manual: "Added by hand" };

/** One customer: details, their story so far, and what we can do for them. */
export async function CustomerDrawer({
  businessId,
  business,
  customer: c,
  closeHref,
}: {
  businessId: string;
  business: BusinessForSequence;
  customer: Customer;
  closeHref: string;
}) {
  const supabase = await supabaseForUser();
  const [visits, messages, requests, openCases] = await Promise.all([
    supabase.from("visits").select("id, visited_at, source").eq("customer_id", c.id).order("visited_at", { ascending: false }).limit(50).then((r) => r.data ?? []),
    supabase
      .from("messages")
      .select("id, direction, body, template_name, status, created_at")
      .eq("customer_id", c.id)
      .order("created_at", { ascending: false })
      .limit(50)
      .then((r) => r.data ?? []),
    supabase
      .from("review_requests")
      .select("id, stage, started_at, link_tapped_at, short_links(code, link_taps(tapped_at, user_agent))")
      .eq("customer_id", c.id)
      .order("started_at", { ascending: false })
      .limit(5)
      .then((r) => r.data ?? []),
    supabase
      .from("cases")
      .select("id, created_at, review_request_id")
      .eq("customer_id", c.id)
      .in("status", ["open", "owner_done"])
      .order("created_at", { ascending: false })
      .then((r) => r.data ?? []),
  ]);
  const openCase = openCases[0];
  const caseMessages = openCase ? messages.filter((m) => m.direction === "in" && m.created_at >= openCase.created_at.slice(0, 19)).reverse() : [];
  const current = requests[0];
  // Jobs are agency-only (row-level security), which is who sees this panel.
  const { data: steps } = current
    ? await supabase.from("jobs").select("type, run_at, state, last_error").eq("review_request_id", current.id).order("run_at").order("id")
    : { data: [] };
  const taps = requests.flatMap((r) =>
    ((r.short_links as unknown as { code: string; link_taps: { tapped_at: string; user_agent: string | null }[] }[]) ?? []).flatMap((l) =>
      l.link_taps.filter((t) => !(t.user_agent ?? "").startsWith("[preview]")),
    ),
  );
  const ready = sequenceReadiness(business);
  const askAgainAt = current && !business.test_mode ? nextAskAllowedAt(current.started_at) : null;
  const running = current && ["scheduled", "checkin_sent", "replied", "no_reply", "link_sent", "reminder_sent", "tapped", "followup_sent"].includes(current.stage);
  const onHold = current?.stage === "on_hold";

  const events: Event[] = [
    { at: c.created_at, title: "Added to the customer list", tone: "grey" as const },
    ...(c.consent_at ? [{ at: c.consent_at, title: "Agreed to WhatsApp messages", detail: c.consentLabel, tone: "green" as const }] : []),
    ...(c.opted_out_at ? [{ at: c.opted_out_at, title: "Asked to stop messages", detail: "Never messaged again", tone: "grey" as const }] : []),
    ...requests.map((r) => ({ at: r.started_at, title: "Review request started", tone: "blue" as const })),
    ...taps.map((t) => ({ at: t.tapped_at, title: "Tapped the review link", detail: "Opened Google's review box", tone: "green" as const })),
    ...visits.map((v) => ({ at: v.visited_at, dateOnly: true, title: "Visit", detail: VISIT_SOURCE[v.source] ?? v.source, tone: "grey" as const })),
    ...messages.map((m) => ({
      at: m.created_at,
      title: m.direction === "in" ? "Customer replied" : m.template_name ? `Sent “${m.template_name}”` : "Message sent",
      detail: m.direction === "out" ? m.status : undefined,
      body: m.body,
      dir: m.direction as "in" | "out",
      tone: "blue" as const,
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  const ids = (
    <>
      <input type="hidden" name="customer_id" value={c.id} />
      <input type="hidden" name="business_id" value={businessId} />
    </>
  );
  const today = todayIST();
  const waLink = `https://wa.me/${c.phone}`;

  return (
    <aside className="card min-w-0 flex-[1_1_340px] p-0 lg:max-w-[440px]" aria-label={c.name ?? "Customer"}>
      <div className="border-b border-line-soft px-[18px] pt-[18px] pb-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="text-[17px] font-semibold tracking-[-0.01em]">{c.name || "No name"}</div>
          <Link href={closeHref} className="hint no-underline hover:underline">
            Close
          </Link>
        </div>
        <div className="mt-1.5 flex flex-wrap gap-x-3.5 gap-y-1.5">
          <span className="hint">{formatPhone(c.phone)}</span>
          <span className="hint">{c.language === "en" ? "English" : "Tamil"}</span>
          <Pill tone={c.stage.tone}>{c.stage.label}</Pill>
        </div>
      </div>

      {openCase ? (
        <div className="border-b border-line-soft bg-[#fbeeee] px-[18px] py-3.5 text-[13px] text-[#5c1414]">
          <div className="mb-1.5 flex items-center gap-2">
            <Pill tone="bad">Needs owner</Pill>
            <span className="hint">since {when(openCase.created_at)}</span>
          </div>
          <p>The customer wrote back. All review messages are paused until someone marks this resolved.</p>
          {caseMessages.length ? (
            <div className="mt-2 space-y-1.5">
              {caseMessages.map((m) => (
                <div key={m.id} className="ta max-w-[340px] rounded-[10px] rounded-tl-[3px] bg-white px-[11px] py-[9px]">
                  {m.body ?? <span className="hint">(voice note, photo or other attachment: open WhatsApp to see it)</span>}
                  <div className="hint mt-1">{when(m.created_at)}</div>
                </div>
              ))}
            </div>
          ) : null}
          <p className="mt-2">Next: the owner calls or replies on WhatsApp and sorts it out. Then mark it resolved here.</p>
          <form action={resolveCase} className="mt-2.5 space-y-2">
            {ids}
            <input type="hidden" name="case_id" value={openCase.id} />
            <label className="block">
              <span className="label">What was done (optional, for the record)</span>
              <textarea name="note" rows={2} className="ta mt-1 w-full rounded-lg border border-line bg-white px-2.5 py-2" placeholder="e.g. Owner called, replaced the cake" />
            </label>
            <PendingButton label={onHold ? "Mark resolved: send the apology with the review link" : "Mark resolved"} pendingLabel="Saving…" className="btn" />
            {onHold ? (
              <p className="hint">
                Sends one message: &ldquo;Sorry again for the trouble… if you&apos;d like to share your experience, here is the link.&rdquo; No reminder after it. It goes whatever the outcome, so every customer is still asked (Google&apos;s rule).
              </p>
            ) : null}
          </form>
        </div>
      ) : null}

      <div className="border-b border-line-soft px-[18px] py-3.5">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-[13px] font-medium">Review request</span>
          {business.test_mode ? <span className="pill pill-wait">Test mode: messages go to {formatPhone(business.test_phone ?? "")}</span> : null}
        </div>
        {current ? (
          <div className="mb-3 text-[13px]">
            <div>
              {running ? "Now: " : "Last request: "}
              {STAGE_TEXT[current.stage] ?? current.stage}
              {running ? "" : ` · ${when(current.started_at)}`}
            </div>
            <ol className="mt-2 space-y-1.5" aria-label="Steps">
              {(steps ?? [])
                .filter((j) => j.type !== "expire" || j.state !== "cancelled")
                .map((j, i) => {
                  const label = JOB_TEXT[j.type] ?? j.type;
                  const skipped = j.state === "done" && j.last_error === "skipped";
                  const status =
                    j.state === "done" && !skipped
                      ? { mark: "✓", text: j.type === "expire" ? `closed ${when(j.run_at)}` : `sent ${when(j.run_at)}`, cls: "text-ink" }
                      : skipped
                        ? { mark: "–", text: "not needed", cls: "text-muted" }
                        : j.state === "cancelled"
                          ? (j.last_error ?? "").startsWith("paused")
                            ? { mark: "‖", text: "paused until the complaint is resolved", cls: "text-[#9f1d1d]" }
                            : { mark: "–", text: j.type === "send_reminder" ? "not needed: link tapped" : "cancelled", cls: "text-muted" }
                          : j.state === "failed"
                            ? { mark: "!", text: `couldn't send: ${j.last_error}`, cls: "text-[#9f1d1d]" }
                            : { mark: "○", text: `next, at ${when(j.run_at)}${j.last_error && j.last_error !== "skipped" ? ` (last try: ${j.last_error})` : ""}`, cls: "text-[#8a3b0a] font-medium" };
                  return (
                    <li key={i} className={`flex gap-2 text-[13px] ${status.cls}`}>
                      <span className="w-3 flex-none text-center" aria-hidden>
                        {status.mark}
                      </span>
                      <span>
                        {label}: {status.text}
                      </span>
                    </li>
                  );
                })}
            </ol>
            {current.stage === "checkin_sent" ? (
              <p className="hint mt-1.5">Waiting for a reply. The review link goes when they reply, or at the time above if they don&apos;t.</p>
            ) : current.stage === "link_sent" ? (
              <p className="hint mt-1.5">Waiting for a tap. If they tap, the reminder is cancelled and the thank-you goes.</p>
            ) : current.stage === "followup_sent" ? (
              <p className="hint mt-1.5">Waiting for a tap. If they tap, the thank-you goes. No reminder after a complaint.</p>
            ) : null}
          </div>
        ) : null}
        {onHold ? (
          <p className="hint">Review messages are paused (see above).</p>
        ) : running ? (
          <form action={runDueNow}>
            <input type="hidden" name="return_to" value={`/customers?b=${businessId}&c=${c.id}`} />
            <PendingButton label="Run due steps now" pendingLabel="Running…" className="btn-ghost" />
            <span className="hint ml-2">Otherwise they run within a minute of being due.</span>
          </form>
        ) : ready.ok ? (
          c.consent_at && !c.opted_out_at ? (
            askAgainAt ? (
              <p className="hint">
                Asked on {when(current!.started_at, false)}. Can be asked again after {when(askAgainAt.toISOString(), false)}.
              </p>
            ) : (
              <form action={startReview}>
                {ids}
                <PendingButton label={current ? "New visit: start review messages again" : "Visit done: start review messages"} pendingLabel="Starting…" className={current ? "btn-ghost" : "btn"} />
                <p className="hint mt-1.5">
                  {current
                    ? `The last request (${when(current.started_at)}) is finished. This records a new visit and starts again.${business.test_mode ? " Allowed now because of test mode." : ""}`
                    : "Records today's visit. Nothing is sent now: the check-in goes after 30 minutes, the review link after that. Usually automatic via the billing app, website or daily list."}
                </p>
              </form>
            )
          ) : (
            <p className="hint">{c.opted_out_at ? "Asked to stop: never messaged." : "Record consent first to send a review request."}</p>
          )
        ) : (
          <p className="hint">{ready.reason}</p>
        )}
      </div>

      {business.test_mode && current ? (
        <details className="border-b border-line-soft px-[18px] py-3 text-[13px]">
          <summary className="cursor-pointer">Test: reply as this customer</summary>
          <form action={simulateReply} className="mt-2 flex flex-wrap items-end gap-2">
            {ids}
            <label className="min-w-0 flex-1">
              <span className="label">Their WhatsApp message</span>
              <input name="text" className="ta mt-1 w-full rounded-lg border border-line bg-white px-2.5 py-2" placeholder="e.g. Food was cold  or  Ok sure" />
            </label>
            <PendingButton label="Pretend they sent it" pendingLabel="Sending…" className="btn-ghost" />
          </form>
          <p className="hint mt-1.5">Meta doesn&apos;t pass real replies to Orbit until the app is published, so this stands in for one. It goes through exactly the same steps.</p>
        </details>
      ) : null}

      <ol className="px-[18px] pt-3.5 pb-1.5">
        {events.map((e, i) => (
          <li key={i} className="grid grid-cols-[64px_14px_minmax(0,1fr)] gap-2.5 pb-3.5">
            <span className="hint pt-px">{when(e.at, !e.dateOnly)}</span>
            <span className="relative flex justify-center">
              {i < events.length - 1 ? <span className="absolute top-3.5 -bottom-3.5 w-px bg-line" aria-hidden /> : null}
              <span
                className={`relative mt-1 h-[9px] w-[9px] rounded-full border-2 ${
                  e.tone === "green" ? "border-[#15803d] bg-[#15803d]" : e.tone === "blue" ? "border-accent bg-accent" : "border-[#9aa0aa] bg-white"
                }`}
                aria-hidden
              />
            </span>
            <div>
              {e.title}
              {e.detail ? <div className="hint">{e.detail}</div> : null}
              {e.body ? (
                <div className={`ta mt-1.5 max-w-[320px] rounded-[10px] rounded-tl-[3px] px-[11px] py-[9px] text-[13px] ${e.dir === "in" ? "bg-[#eef2fc]" : "bg-[#f1f0ec]"}`}>{e.body}</div>
              ) : null}
            </div>
          </li>
        ))}
      </ol>

      <div className="space-y-4 border-t border-line-soft px-[18px] pt-3.5 pb-[18px]">
        <form action={addVisit} className="flex flex-wrap items-end gap-2">
          {ids}
          <label className="flex-1">
            <span className="label">Record a visit</span>
            <input type="date" name="visit_date" defaultValue={today} max={today} className="input" />
          </label>
          <PendingButton label="Add visit" pendingLabel="Adding…" className="btn-ghost" />
        </form>
        {!c.consent_at && !c.opted_out_at ? (
          <form action={recordConsent} className="flex flex-wrap items-end gap-2">
            {ids}
            <label className="flex-1">
              <span className="label">They agreed to WhatsApp messages</span>
              <select name="consent_source" className="input">
                {Object.entries(CONSENT_SOURCES)
                  .filter(([k]) => k !== "import")
                  .map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
              </select>
            </label>
            <PendingButton label="Record consent" pendingLabel="Saving…" className="btn-ghost" />
          </form>
        ) : null}

        <details>
          <summary className="cursor-pointer text-[13px] text-link">Edit name or language</summary>
          <form action={updateCustomer} className="mt-3 flex flex-wrap items-end gap-2">
            {ids}
            <label className="flex-[2_1_160px]">
              <span className="label">Name</span>
              <input name="name" defaultValue={c.name ?? ""} className="input" />
            </label>
            <label className="flex-[1_1_100px]">
              <span className="label">Language</span>
              <select name="language" defaultValue={c.language ?? "ta"} className="input">
                <option value="ta">Tamil</option>
                <option value="en">English</option>
              </select>
            </label>
            <PendingButton label="Save" pendingLabel="Saving…" className="btn-ghost" />
          </form>
        </details>

        <div className="flex flex-wrap gap-2">
          <a href={waLink} target="_blank" rel="noreferrer" className="btn-ghost">
            Open chat in WhatsApp
          </a>
          {!c.opted_out_at ? (
            <details className="w-full">
              <summary className="cursor-pointer text-[13px] text-[#9f1d1d]">Customer asked to stop messages…</summary>
              <form action={stopMessages} className="mt-2 rounded-lg bg-[#fbeeee] p-3 text-[13px] text-[#9f1d1d]">
                {ids}
                <p className="mb-2">This is permanent: they will never get another message from this business through us.</p>
                <PendingButton label="Stop all messages" pendingLabel="Stopping…" className="btn-danger" />
              </form>
            </details>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
