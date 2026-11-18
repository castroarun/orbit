import Link from "next/link";
import { consentLabel } from "@/lib/consent";
import { customerStage, maskPhone, STAGE_FILTERS, type StageKey } from "@/lib/customer-stage";
import { todayIST } from "@/lib/dates";
import { formatPhone } from "@/lib/phone";
import { listBusinesses, loadAgency } from "@/lib/page-data";
import { BusinessPicker } from "../business-picker";
import { Notice, param } from "../notice";
import { Empty, PageHeader, Pill, when } from "../ui";
import { AddCustomer } from "./add-customer";
import { CustomerDrawer } from "./drawer";

/** The pilot is small, so the list loads once and filters on the server. Above this we'd page. */
const MAX_LOADED = 2000;

type Row = {
  id: string;
  name: string | null;
  phone: string;
  language: string | null;
  consent_at: string | null;
  consent_source: string | null;
  opted_out_at: string | null;
  created_at: string;
  review_requests: { stage: string; link_tapped_at: string | null; started_at: string }[];
  visits: { visited_at: string }[];
};

export default async function CustomersPage({ searchParams }: PageProps<"/customers">) {
  const sp = await searchParams;
  const { supabase } = await loadAgency();
  const businesses = await listBusinesses(supabase);
  if (!businesses.length)
    return (
      <div>
        <PageHeader title="Customers" />
        <Empty title="Add a business first" action={{ href: "/businesses/new", label: "Add business" }}>
          Customers always belong to one business.
        </Empty>
      </div>
    );

  const business = businesses.find((b) => b.id === param(sp.b)) ?? businesses[0];
  const filter = (param(sp.f) ?? "all") as StageKey | "all";
  const q = (param(sp.q) ?? "").trim();
  const selectedId = param(sp.c);
  const adding = param(sp.add) === "1";

  const { data, error } = await supabase
    .from("customers")
    .select("id, name, phone, language, consent_at, consent_source, opted_out_at, created_at, review_requests(stage, link_tapped_at, started_at), visits(visited_at)")
    .eq("business_id", business.id)
    .order("created_at", { ascending: false })
    .order("started_at", { referencedTable: "review_requests", ascending: false })
    .limit(1, { referencedTable: "review_requests" })
    .order("visited_at", { referencedTable: "visits", ascending: false })
    .limit(1, { referencedTable: "visits" })
    .limit(MAX_LOADED);
  if (error) throw error;

  const all = ((data ?? []) as Row[]).map((c) => ({ ...c, stage: customerStage(c, c.review_requests[0]), lastVisit: c.visits[0]?.visited_at ?? null }));
  const counts = new Map<string, number>([["all", all.length]]);
  for (const c of all) counts.set(c.stage.key, (counts.get(c.stage.key) ?? 0) + 1);

  const digits = q.replace(/\D/g, "");
  const shown = all.filter(
    (c) =>
      (filter === "all" || c.stage.key === filter) &&
      (!q || (c.name ?? "").toLowerCase().includes(q.toLowerCase()) || (digits.length >= 3 && c.phone.includes(digits))),
  );
  const selected = selectedId ? all.find((c) => c.id === selectedId) : undefined;

  const href = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams({ b: business.id });
    const merged = { f: filter === "all" ? undefined : filter, q: q || undefined, ...extra };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    return `/customers?${p}`;
  };

  return (
    <div>
      <PageHeader
        crumb={`${business.name}${business.area ? ` · ${business.area}` : ""}`}
        title="Customers"
        actions={
          <>
            <BusinessPicker businesses={businesses} current={business.id} basePath="/customers" />
            <Link href={`/import?b=${business.id}`} className="btn-ghost">
              Import from Excel
            </Link>
            <Link href={href({ add: "1" })} className="btn">
              Add customer
            </Link>
          </>
        }
      />
      <Notice ok={param(sp.ok)} error={param(sp.error)} />

      {adding ? <AddCustomer businessId={business.id} defaultLanguage={business.languages[0] ?? "ta"} closeHref={href({})} today={todayIST()} /> : null}

      {all.length === 0 && !adding ? (
        <Empty title={`No customers for ${business.name} yet`} action={{ href: `/import?b=${business.id}`, label: "Import from Excel" }}>
          Import the owner&apos;s customer list, or add customers one by one with “Add customer”.
        </Empty>
      ) : all.length ? (
        <>
          <form action="/customers" className="mb-3.5 flex flex-wrap items-center gap-2.5">
            <input type="hidden" name="b" value={business.id} />
            {filter !== "all" ? <input type="hidden" name="f" value={filter} /> : null}
            <label className="flex h-[34px] max-w-[340px] flex-[1_1_240px] items-center gap-2 rounded-lg border border-[#dad7d0] bg-white px-3">
              <span className="sr-only">Search customers</span>
              <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 flex-none fill-none stroke-muted" strokeWidth={1.6} strokeLinecap="round">
                <circle cx="11" cy="11" r="6.5" />
                <path d="M16 16l4 4" />
              </svg>
              <input type="search" name="q" defaultValue={q} placeholder="Name or phone number" className="min-w-0 flex-1 bg-transparent text-[13.5px] outline-none" />
            </label>
            <button className="btn-ghost">Search</button>
          </form>

          <div className="mb-3.5 flex flex-wrap gap-1.5" role="group" aria-label="Filter by stage">
            {STAGE_FILTERS.filter((s) => s.key === "all" || counts.get(s.key)).map((s) => (
              <Link key={s.key} href={href({ f: s.key === "all" ? undefined : s.key })} className={`chip no-underline ${filter === s.key ? "on" : ""}`} aria-current={filter === s.key ? "true" : undefined}>
                {s.label} <b>{counts.get(s.key) ?? 0}</b>
              </Link>
            ))}
          </div>

          <div className="flex flex-wrap items-start gap-4">
            <div className="card min-w-0 flex-[2_1_560px] overflow-x-auto p-0">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>WhatsApp</th>
                    <th>Last visit</th>
                    <th>Where they are</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((c) => {
                    const on = c.id === selected?.id;
                    return (
                      <tr key={c.id} className={on ? "bg-[#f4f6fc] [&>td:first-child]:shadow-[inset_3px_0_0_var(--color-accent)]" : "hover:bg-[#fafaf8]"}>
                        <td>
                          <Link href={href({ c: c.id })} className="font-medium text-ink no-underline hover:underline" aria-current={on ? "true" : undefined}>
                            {c.name || "No name"}
                          </Link>
                        </td>
                        <td className="whitespace-nowrap">{maskPhone(formatPhone(c.phone))}</td>
                        <td className="whitespace-nowrap">{c.lastVisit ? when(c.lastVisit, false) : <span className="hint">—</span>}</td>
                        <td>
                          <Pill tone={c.stage.tone}>{c.stage.label}</Pill>
                        </td>
                      </tr>
                    );
                  })}
                  {shown.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="hint py-6 text-center">
                        No customers match.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
              {all.length >= MAX_LOADED ? <p className="hint border-t border-line-soft px-4 py-2">Showing the newest {MAX_LOADED}. Search to find others.</p> : null}
            </div>

            {selected ? (
              <CustomerDrawer
                businessId={business.id}
                customer={{ ...selected, consentLabel: consentLabel(selected.consent_source) }}
                closeHref={href({})}
              />
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
