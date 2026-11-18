import Link from "next/link";
import { notFound } from "next/navigation";
import { BUSINESS_STATUSES, missingSetup, reviewLink, SENDING_MODES } from "@/lib/business";
import { formatPhone } from "@/lib/phone";
import { sequenceReadiness } from "@/lib/sequence/engine";
import { runDueNow } from "../../../actions-crm";
import { PendingButton } from "../../pending-button";
import { Connections } from "./connections";
import { AutoRefresh } from "../../auto-refresh";
import { BUSINESS_COLUMNS, loadAgency, monthStartIST, type BusinessRow } from "@/lib/page-data";
import { Notice, param } from "../../notice";
import { PageHeader, Pill, Section, when } from "../../ui";

const AUDIT_TEXT: Record<string, (d: Record<string, unknown>) => string> = {
  business_added: () => "Business added",
  business_updated: () => "Business details changed",
  customers_imported: (d) =>
    `Imported ${d.file ?? "a file"}: ${d.added ?? 0} new, ${d.updated ?? 0} updated, ${d.visits ?? 0} visits`,
  consent_given: () => "Consent recorded for a customer",
  opted_out: () => "A customer asked to stop messages",
};

const REQUEST_STAGE: Record<string, string> = {
  scheduled: "Check-in scheduled",
  checkin_sent: "Check-in sent",
  replied: "Replied",
  no_reply: "No reply",
  link_sent: "Review link sent",
  reminder_sent: "Reminder sent",
  tapped: "Tapped the link",
  thanked: "Tapped and thanked",
  stopped: "Stopped",
  expired: "Closed, no tap",
};
const RUNNING = ["scheduled", "checkin_sent", "replied", "no_reply", "link_sent", "reminder_sent", "tapped"];

const LANG = { ta: "Tamil", en: "English" } as Record<string, string>;
const hhmm = (t: string) => t.slice(0, 5);

export default async function BusinessPage({ params, searchParams }: PageProps<"/businesses/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase } = await loadAgency();
  const { data } = await supabase
    .from("businesses")
    .select(`${BUSINESS_COLUMNS}, quiet_start, quiet_end`)
    .eq("id", id)
    .eq("is_sandbox", false)
    .maybeSingle();
  if (!data) notFound();
  const b = data as BusinessRow & { quiet_start: string; quiet_end: string };

  const count = (q: PromiseLike<{ count: number | null }>) => q.then((r) => r.count ?? 0);
  const base = () => supabase.from("customers").select("id", { count: "exact", head: true }).eq("business_id", id);
  const [total, canMessage, noConsent, stopped, visitsThisMonth, snapshot, activity, requests] = await Promise.all([
    count(base()),
    count(base().not("consent_at", "is", null).is("opted_out_at", null)),
    count(base().is("consent_at", null).is("opted_out_at", null)),
    count(base().not("opted_out_at", "is", null)),
    count(supabase.from("visits").select("id", { count: "exact", head: true }).eq("business_id", id).gte("visited_at", monthStartIST())),
    supabase
      .from("review_snapshots")
      .select("snapshot_date, rating, review_count")
      .eq("business_id", id)
      .order("snapshot_date", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then((r) => r.data),
    supabase
      .from("audit_log")
      .select("id, action, details, at")
      .eq("business_id", id)
      .order("at", { ascending: false })
      .limit(8)
      .then((r) => r.data ?? []),
    supabase
      .from("review_requests")
      .select("id, stage, started_at, customer_id, customers(name)")
      .eq("business_id", id)
      .order("started_at", { ascending: false })
      .limit(8)
      .then((r) => r.data ?? []),
  ]);
  const ready = sequenceReadiness(b);

  const link = reviewLink(b);
  const missing = missingSetup(b);

  return (
    <div>
      <PageHeader
        crumb={
          <>
            <Link href="/businesses" className="text-muted no-underline hover:underline">
              Businesses
            </Link>{" "}
            / {[b.area, b.kind].filter(Boolean).join(" · ") || "Client"}
          </>
        }
        title={b.name}
        actions={
          <>
            <Link href={`/businesses/${b.id}/edit`} className="btn-ghost">
              Edit
            </Link>
            <Link href={`/import?b=${b.id}`} className="btn-ghost">
              Import customers
            </Link>
            <Link href={`/customers?b=${b.id}`} className="btn">
              Customers
            </Link>
          </>
        }
      />
      <Notice ok={param(sp.ok)} error={param(sp.error)} />

      {missing.length ? (
        <div className="mb-6 rounded-lg border border-[#f0ddbb] bg-[#fbf3e6] px-4 py-3 text-sm text-[#8a3b0a]">
          Still to add: {missing.join(", ")}.{" "}
          <Link href={`/businesses/${b.id}/edit`} className="font-medium underline">
            Add them
          </Link>
        </div>
      ) : null}

      <div className="card mb-7 grid grid-cols-1 p-0 sm:grid-cols-2 lg:grid-cols-4">
        <div className="border-b border-line-soft px-[18px] py-4 lg:border-r lg:border-b-0">
          <div className="hint">Google rating</div>
          {snapshot?.rating != null ? (
            <>
              <div className="mt-1.5 text-2xl font-semibold tracking-[-0.02em]">{snapshot.rating}</div>
              <div className="hint">Checked {when(snapshot.snapshot_date, false)}</div>
            </>
          ) : (
            <div className="mt-2 text-sm text-ink-2">Not tracked yet</div>
          )}
        </div>
        <div className="border-b border-line-soft px-[18px] py-4 lg:border-r lg:border-b-0">
          <div className="hint">Google reviews</div>
          {snapshot?.review_count != null ? (
            <div className="mt-1.5 text-2xl font-semibold tracking-[-0.02em]">{snapshot.review_count}</div>
          ) : (
            <div className="mt-2 text-sm text-ink-2">{b.google_place_id ? "Daily tracking comes next" : "Needs the Place ID"}</div>
          )}
        </div>
        <div className="border-b border-line-soft px-[18px] py-4 sm:border-b-0 lg:border-r">
          <div className="hint">WhatsApp sending</div>
          <div className="mt-2">
            <Pill tone={b.messaging_mode === "meta" ? "ok" : "neu"}>{SENDING_MODES[b.messaging_mode]}</Pill>
          </div>
          <div className="hint mt-1">{b.messaging_mode === "wame" ? "Staff press send in WhatsApp" : "Sent from the business number"}</div>
        </div>
        <div className="px-[18px] py-4">
          <div className="hint">Review link</div>
          <div className="mt-2">{link ? <Pill tone="ok">Set</Pill> : <Pill tone="wait">Missing</Pill>}</div>
          {link ? (
            <a href={link} target="_blank" rel="noreferrer" className="link hint mt-1 inline-block">
              Open it to check →
            </a>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-4">
        <div className="flex min-w-0 flex-[2_1_480px] flex-col gap-7">
          <Section title="Customers" aside={<Link href={`/customers?b=${b.id}`} className="link">All customers</Link>}>
            <div className="card grid grid-cols-2 gap-y-4 sm:grid-cols-4">
              {[
                ["Customers", total, `/customers?b=${b.id}`],
                ["Can be messaged", canMessage, `/customers?b=${b.id}&f=new`],
                ["No consent (saved only)", noConsent, `/customers?b=${b.id}&f=no_consent`],
                ["Asked to stop", stopped, `/customers?b=${b.id}&f=stopped`],
              ].map(([label, n, href]) => (
                <Link key={label as string} href={href as string} className="text-ink no-underline">
                  <div className="text-[22px] font-semibold tracking-[-0.02em]">{n}</div>
                  <div className="hint">{label}</div>
                </Link>
              ))}
            </div>
            <p className="hint mt-2">{visitsThisMonth} visits recorded this month.</p>
          </Section>

          <Section title="Recent activity">
            {activity.length ? (
              <ul className="card divide-y divide-line-soft p-0">
                {activity.map((a) => (
                  <li key={a.id} className="flex gap-3 px-4 py-3">
                    <span className="hint w-24 flex-none">{when(a.at)}</span>
                    <span>{(AUDIT_TEXT[a.action] ?? (() => a.action.replaceAll("_", " ")))((a.details ?? {}) as Record<string, unknown>)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="hint">Nothing yet.</p>
            )}
          </Section>
        </div>

        <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-7">
          <Section title="Review requests" aside={<AutoRefresh active={requests.some((r) => RUNNING.includes(r.stage))} />}>
            <div className="card space-y-3 p-4 text-[13.5px]">
              {b.test_mode ? (
                <div className="pill pill-wait">Test mode: everything goes to {formatPhone(b.test_phone ?? "")}</div>
              ) : null}
              <div className={ready.ok ? "" : "hint"}>{ready.ok ? b.auto_requests ? "Ready: new visits from the billing app, website or daily list start review messages automatically." : "Ready, but automatic requests are off (Edit). Start them from a customer." : ready.reason}</div>
              {requests.length ? (
                <ul className="divide-y divide-line-soft">
                  {requests.map((r) => (
                    <li key={r.id} className="flex justify-between gap-3 py-2">
                      <Link href={`/customers?b=${b.id}&c=${r.customer_id}`} className="text-ink no-underline hover:underline">
                        {(r.customers as unknown as { name: string | null } | null)?.name ?? "Customer"}
                      </Link>
                      <span className="hint text-right">
                        {REQUEST_STAGE[r.stage] ?? r.stage} · {when(r.started_at)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {requests.some((r) => RUNNING.includes(r.stage)) ? (
                <form action={runDueNow}>
                  <input type="hidden" name="return_to" value={`/businesses/${b.id}`} />
                  <PendingButton label="Run due steps now" pendingLabel="Running…" className="btn-ghost" />
                  <span className="hint ml-2">Sends any step that is due; otherwise they go within a minute.</span>
                </form>
              ) : null}
            </div>
          </Section>

          <Connections businessId={b.id} autoRequests={b.auto_requests} />

          <Section title="Setup" aside={<Link href={`/businesses/${b.id}/edit`} className="link">Edit</Link>}>
            <ul className="card divide-y divide-line-soft p-0 text-[13.5px]">
              {[
                ["Status", BUSINESS_STATUSES[b.status]],
                ["Automatic review requests", b.auto_requests ? "On" : "Off"],
                ["Owner", b.owner_first_name ?? "—"],
                ["Complaint alerts to", b.owner_phone ? formatPhone(b.owner_phone) : "—"],
                ["Languages", b.languages.map((l) => LANG[l] ?? l).join(", ")],
                ["Sending hours", `${hhmm(b.quiet_end)} to ${hhmm(b.quiet_start)}`],
                ["Plan", b.plan ?? "—"],
              ].map(([k, v]) => (
                <li key={k} className="flex justify-between gap-3 px-4 py-[11px]">
                  <span className="hint">{k}</span>
                  <span className="text-right">{v}</span>
                </li>
              ))}
            </ul>
            {b.notes ? <p className="card mt-3 text-[13.5px] whitespace-pre-wrap">{b.notes}</p> : null}
          </Section>
        </div>
      </div>
    </div>
  );
}
