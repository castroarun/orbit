import Link from "next/link";
import { BUSINESS_STATUSES, missingSetup, SENDING_MODES } from "@/lib/business";
import { listBusinesses, loadAgency } from "@/lib/page-data";
import { Notice, param } from "../notice";
import { Empty, PageHeader, Pill } from "../ui";

const statusTone = { pilot: "info", active: "ok", paused: "wait", ended: "neu" } as const;

export default async function BusinessesPage({ searchParams }: PageProps<"/businesses">) {
  const sp = await searchParams;
  const { supabase } = await loadAgency();
  const businesses = await listBusinesses(supabase);

  // Customer counts per business (a handful of businesses, so one small query each).
  const counts = await Promise.all(
    businesses.map(async (b) => {
      const [all, consented] = await Promise.all([
        supabase.from("customers").select("id", { count: "exact", head: true }).eq("business_id", b.id),
        supabase
          .from("customers")
          .select("id", { count: "exact", head: true })
          .eq("business_id", b.id)
          .not("consent_at", "is", null)
          .is("opted_out_at", null),
      ]);
      return { all: all.count ?? 0, consented: consented.count ?? 0 };
    }),
  );

  return (
    <div>
      <PageHeader
        crumb="Clients we run review requests for"
        title="Businesses"
        actions={
          <Link href="/businesses/new" className="btn">
            Add business
          </Link>
        }
      />
      <Notice ok={param(sp.ok)} error={param(sp.error)} />

      {businesses.length === 0 ? (
        <Empty title="No businesses yet" action={{ href: "/businesses/new", label: "Add the first business" }}>
          Add the pilot shop with its Google review link and the owner&apos;s WhatsApp number, then import its customers.
        </Empty>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="tbl">
            <thead>
              <tr>
                <th>Business</th>
                <th>Status</th>
                <th>WhatsApp sending</th>
                <th className="text-right">Customers</th>
                <th className="text-right">Can message</th>
                <th>Setup</th>
              </tr>
            </thead>
            <tbody>
              {businesses.map((b, i) => {
                const missing = missingSetup(b);
                return (
                  <tr key={b.id}>
                    <td>
                      <Link href={`/businesses/${b.id}`} className="font-medium text-ink hover:underline">
                        {b.name}
                      </Link>
                      <div className="hint">{[b.area, b.kind].filter(Boolean).join(" · ") || "—"}</div>
                    </td>
                    <td>
                      <Pill tone={statusTone[b.status]}>{BUSINESS_STATUSES[b.status]}</Pill>
                    </td>
                    <td>
                      <Pill tone={b.messaging_mode === "meta" ? "ok" : "neu"}>{SENDING_MODES[b.messaging_mode]}</Pill>
                    </td>
                    <td className="text-right">{counts[i].all}</td>
                    <td className="text-right">{counts[i].consented}</td>
                    <td>
                      {missing.length ? (
                        <span className="hint">Missing: {missing.map((m) => m.split(" (")[0]).join(", ")}</span>
                      ) : (
                        <Pill tone="ok">Complete</Pill>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
