import Link from "next/link";
import { addVisit, recordConsent, stopMessages, updateCustomer } from "../../actions-crm";
import { CONSENT_SOURCES } from "@/lib/consent";
import type { StageInfo } from "@/lib/customer-stage";
import { todayIST } from "@/lib/dates";
import { formatPhone } from "@/lib/phone";
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

type Event = { at: string; title: string; detail?: string; body?: string | null; dir?: "in" | "out"; tone: "grey" | "blue" | "green" };

const VISIT_SOURCE: Record<string, string> = { staff: "Marked by staff", import: "From imported list", billing: "From billing", manual: "Added by hand" };

/** One customer: details, their story so far, and what we can do for them. */
export async function CustomerDrawer({ businessId, customer: c, closeHref }: { businessId: string; customer: Customer; closeHref: string }) {
  const supabase = await supabaseForUser();
  const [visits, messages] = await Promise.all([
    supabase.from("visits").select("id, visited_at, source").eq("customer_id", c.id).order("visited_at", { ascending: false }).limit(50).then((r) => r.data ?? []),
    supabase
      .from("messages")
      .select("id, direction, body, template_name, status, created_at")
      .eq("customer_id", c.id)
      .order("created_at", { ascending: false })
      .limit(50)
      .then((r) => r.data ?? []),
  ]);

  const events: Event[] = [
    { at: c.created_at, title: "Added to the customer list", tone: "grey" as const },
    ...(c.consent_at ? [{ at: c.consent_at, title: "Agreed to WhatsApp messages", detail: c.consentLabel, tone: "green" as const }] : []),
    ...(c.opted_out_at ? [{ at: c.opted_out_at, title: "Asked to stop messages", detail: "Never messaged again", tone: "grey" as const }] : []),
    ...visits.map((v) => ({ at: v.visited_at, title: "Visit", detail: VISIT_SOURCE[v.source] ?? v.source, tone: "grey" as const })),
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

      <ol className="px-[18px] pt-3.5 pb-1.5">
        {events.map((e, i) => (
          <li key={i} className="grid grid-cols-[64px_14px_minmax(0,1fr)] gap-2.5 pb-3.5">
            <span className="hint pt-px">{when(e.at)}</span>
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
