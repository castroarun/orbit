import Link from "next/link";
import { missingSetup, SENDING_MODES } from "@/lib/business";
import { listBusinesses, loadAgency, monthStartIST } from "@/lib/page-data";
import { Empty, PageHeader, Pill, Section, when } from "./ui";

/** Agency overview: every number here is counted from the database, nothing estimated. */
export default async function OverviewPage() {
  const { supabase } = await loadAgency();
  const businesses = (await listBusinesses(supabase)).filter((b) => b.status !== "ended");
  const since = monthStartIST();
  const monthName = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", month: "long", year: "numeric" });

  const count = (q: PromiseLike<{ count: number | null }>) => q.then((r) => r.count ?? 0);
  const perBusiness = await Promise.all(
    businesses.map(async (b) => {
      const cust = () => supabase.from("customers").select("id", { count: "exact", head: true }).eq("business_id", b.id);
      const [customers, canMessage, requests, snapshot] = await Promise.all([
        count(cust()),
        count(cust().not("consent_at", "is", null).is("opted_out_at", null)),
        count(supabase.from("review_requests").select("id", { count: "exact", head: true }).eq("business_id", b.id).gte("started_at", since)),
        supabase
          .from("review_snapshots")
          .select("rating, review_count")
          .eq("business_id", b.id)
          .order("snapshot_date", { ascending: false })
          .limit(1)
          .maybeSingle()
          .then((r) => r.data),
      ]);
      return { customers, canMessage, requests, snapshot, missing: missingSetup(b) };
    }),
  );

  const ids = businesses.map((b) => b.id);
  const [taps, openCases] = ids.length
    ? await Promise.all([
        count(supabase.from("link_taps").select("id, short_links!inner(business_id)", { count: "exact", head: true }).in("short_links.business_id", ids).gte("tapped_at", since)),
        supabase
          .from("cases")
          .select("id, created_at, business_id, customer_id, customers(name), messages:trigger_message_id(body)")
          .in("business_id", ids)
          .in("status", ["open", "owner_done", "checked_back", "unresolved"])
          .order("created_at", { ascending: false })
          .limit(10)
          .then((r) => r.data ?? []),
      ])
    : [0, []];

  const sum = (k: "customers" | "canMessage" | "requests") => perBusiness.reduce((a, p) => a + p[k], 0);
  const requests = sum("requests");
  const setupGaps = businesses.map((b, i) => ({ b, missing: perBusiness[i].missing })).filter((x) => x.missing.length);
  const nameOf = (id: string) => businesses.find((b) => b.id === id)?.name ?? "";

  return (
    <div>
      <PageHeader
        crumb={`${monthName} · all businesses`}
        title="Overview"
        actions={
          <>
            <Link href="/import" className="btn-ghost">
              Import customers
            </Link>
            <Link href="/businesses/new" className="btn">
              Add business
            </Link>
          </>
        }
      />

      {businesses.length === 0 ? (
        <Empty title="No businesses yet" action={{ href: "/businesses/new", label: "Add the first business" }}>
          Start with the pilot shop: add it, import its customers, and its numbers will show here.
        </Empty>
      ) : (
        <>
          <div className="mb-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              ["Customers", sum("customers"), `${sum("canMessage")} can be messaged`],
              ["Review requests sent", requests, requests ? `This month, ${businesses.length} businesses` : "Start when the message sequence is on"],
              ["Review link taps", taps, requests ? `${Math.round((taps / requests) * 100)}% of requests this month` : "This month"],
              ["Needs attention", setupGaps.length + openCases.length, `${openCases.length} complaints, ${setupGaps.length} setup steps`],
            ].map(([label, value, sub]) => (
              <div key={label as string} className="card px-[18px] py-4">
                <div className="hint">{label}</div>
                <div className="mt-1.5 text-[28px] font-semibold tracking-[-0.02em]">{value}</div>
                <div className="mt-0.5 text-[12.5px] text-[#4b5160]">{sub}</div>
              </div>
            ))}
          </div>

          <Section title="Businesses" aside={<span className="hint">Ratings refresh daily once tracking is on</span>}>
            <div className="card overflow-x-auto p-0">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Business</th>
                    <th>WhatsApp</th>
                    <th>Google rating</th>
                    <th className="text-right">Reviews</th>
                    <th className="text-right">Customers</th>
                    <th className="text-right">Requests this month</th>
                  </tr>
                </thead>
                <tbody>
                  {businesses.map((b, i) => {
                    const p = perBusiness[i];
                    return (
                      <tr key={b.id}>
                        <td>
                          <Link href={`/businesses/${b.id}`} className="font-medium text-ink no-underline hover:underline">
                            {b.name}
                          </Link>
                          <div className="hint">{[b.area, b.kind].filter(Boolean).join(" · ") || "—"}</div>
                        </td>
                        <td>
                          <Pill tone={b.messaging_mode === "meta" ? "ok" : "neu"}>{SENDING_MODES[b.messaging_mode]}</Pill>
                        </td>
                        <td>{p.snapshot?.rating ?? <span className="hint">Not tracked yet</span>}</td>
                        <td className="text-right">{p.snapshot?.review_count ?? <span className="hint">—</span>}</td>
                        <td className="text-right">
                          {p.customers}
                          <div className="hint">{p.canMessage} can be messaged</div>
                        </td>
                        <td className="text-right">{p.requests}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Section>

          <div className="mt-7 max-w-3xl">
            <Section title="Needs attention">
              {setupGaps.length + openCases.length === 0 ? (
                <p className="hint">Nothing right now.</p>
              ) : (
                <ul className="card divide-y divide-line-soft p-0">
                  {openCases.map((c) => (
                    <li key={c.id} className="flex items-start gap-3 px-4 py-3">
                      <Pill tone="bad">Needs owner</Pill>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">
                          {(c.customers as unknown as { name: string | null } | null)?.name ?? "Customer"} · {nameOf(c.business_id)}
                        </div>
                        <div className="hint truncate">
                          {(c.messages as unknown as { body: string | null } | null)?.body ?? "Customer wrote back"} · {when(c.created_at)} · review messages paused
                        </div>
                      </div>
                      <Link href={`/customers?b=${c.business_id}&c=${c.customer_id}`} className="btn-ghost flex-none">
                        Open
                      </Link>
                    </li>
                  ))}
                  {setupGaps.map(({ b, missing }) => (
                    <li key={b.id} className="flex items-start gap-3 px-4 py-3">
                      <Pill tone="wait">Setup</Pill>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">{b.name}</div>
                        <div className="hint">Missing: {missing.join(", ")}</div>
                      </div>
                      <Link href={`/businesses/${b.id}/edit`} className="btn-ghost flex-none">
                        Fix
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>
        </>
      )}
    </div>
  );
}
