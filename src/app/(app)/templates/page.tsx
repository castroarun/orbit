import { loadSandbox } from "@/lib/page-data";
import { syncTemplates } from "../../actions";
import { TemplateForm } from "./template-form";
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

      <TemplateForm />

      <h2 className="pt-2 text-lg font-semibold text-navy">Your templates</h2>
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
