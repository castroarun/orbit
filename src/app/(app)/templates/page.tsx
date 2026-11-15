import { loadSandbox } from "@/lib/page-data";
import { createTemplateAction, syncTemplates } from "../../actions";
import { Notice, param } from "../notice";
import { PendingButton } from "../pending-button";

const badge: Record<string, string> = {
  APPROVED: "bg-green-50 text-green-800",
  PENDING: "bg-gold-soft text-navy",
  REJECTED: "bg-red-50 text-red-700",
};

export default async function TemplatesPage({ searchParams }: PageProps<"/templates">) {
  const sp = await searchParams;
  const { business, supabase } = await loadSandbox();
  const { data: templates } = await supabase
    .from("templates")
    .select("name, language, category, status, body, rejection_reason, updated_at")
    .eq("business_id", business.id)
    .order("updated_at", { ascending: false });

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-navy">Message templates</h1>
          <p className="mt-1 text-sm text-muted">Meta approves each message format once. Names, links and offers can change on every send.</p>
        </div>
        <form action={syncTemplates}>
          <PendingButton className="btn-gold" label="Refresh from Meta" pendingLabel="Refreshing…" />
        </form>
      </div>

      <Notice ok={param(sp.ok)} error={param(sp.error)} />

      <form action={createTemplateAction} className="card grid gap-5 md:grid-cols-3">
        <div>
          <label className="label" htmlFor="name">Name</label>
          <input className="input" id="name" name="name" placeholder="visit_checkin" required />
        </div>
        <div>
          <label className="label" htmlFor="language">Language</label>
          <select className="input" id="language" name="language" defaultValue="en">
            <option value="en">English (en)</option>
            <option value="ta">Tamil (ta)</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="category">Category</label>
          <select className="input" id="category" name="category" defaultValue="UTILITY">
            <option value="UTILITY">Utility (about a specific visit or order)</option>
            <option value="MARKETING">Marketing (offers, reactivation)</option>
          </select>
        </div>
        <div className="md:col-span-3">
          <label className="label" htmlFor="body">Message text</label>
          <textarea
            className="input min-h-28"
            id="body"
            name="body"
            required
            defaultValue={"Hi {{1}}, this is {{2}}. Thank you for visiting us today. Is everything good after your visit?"}
          />
          <p className="hint mt-1">Use {"{{1}}"}, {"{{2}}"}… for values that change. Don&apos;t start or end with one.</p>
        </div>
        <div className="md:col-span-2">
          <label className="label" htmlFor="examples">Example values</label>
          <input className="input" id="examples" name="examples" defaultValue="Priya | Ravi" />
          <p className="hint mt-1">One per placeholder, separated by |. Meta uses these to review.</p>
        </div>
        <div className="flex items-end">
          <PendingButton className="btn w-full" label="Submit to Meta" pendingLabel="Submitting…" />
        </div>
      </form>

      <div className="card p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-line text-left text-muted">
            <tr>
              <th className="px-6 py-3 font-medium">Template</th>
              <th className="px-6 py-3 font-medium">Category</th>
              <th className="px-6 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {(templates ?? []).map((t) => (
              <tr key={`${t.name}-${t.language}`} className="border-b border-line last:border-0 align-top">
                <td className="px-6 py-4">
                  <div className="font-medium text-navy">
                    {t.name} <span className="text-muted">· {t.language}</span>
                  </div>
                  <div className="mt-1 max-w-xl text-muted">{t.body}</div>
                </td>
                <td className="px-6 py-4">{t.category}</td>
                <td className="px-6 py-4">
                  <span className={`rounded-full px-3 py-1 text-xs font-medium ${badge[t.status] ?? "bg-navy-soft text-navy"}`}>{t.status}</span>
                  {t.rejection_reason ? <div className="hint mt-1">{t.rejection_reason}</div> : null}
                </td>
              </tr>
            ))}
            {!templates?.length ? (
              <tr>
                <td colSpan={3} className="px-6 py-8 text-center text-muted">
                  No templates yet. Create one above, or refresh to pull Meta&apos;s samples.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
