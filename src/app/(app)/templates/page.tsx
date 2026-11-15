import { syncIfPending } from "@/lib/template-sync";
import { loadSandbox } from "@/lib/page-data";
import { syncTemplates } from "../../actions";
import Link from "next/link";
import { EDITABLE_STATUSES, formFromComponents } from "@/lib/meta/templates";
import { templateView } from "@/lib/meta/template-view";
import { DeleteTemplateButton } from "./delete-button";
import { TemplateForm, type EditingTemplate } from "./template-form";
import { Notice, param } from "../notice";
import { PendingButton } from "../pending-button";

const badge: Record<string, string> = {
  APPROVED: "bg-green-50 text-green-800",
  PENDING: "bg-gold-soft text-navy",
  PAUSED: "bg-orange-50 text-orange-800",
  DISABLED: "bg-red-50 text-red-700",
  REJECTED: "bg-red-50 text-red-700",
};

export default async function TemplatesPage({ searchParams }: PageProps<"/templates">) {
  const sp = await searchParams;
  const { business, supabase } = await loadSandbox();
  await syncIfPending(business);
  const { data: templates } = await supabase
    .from("templates")
    .select("id, name, language, category, status, body, components, rejection_reason, updated_at")
    .eq("business_id", business.id)
    .order("updated_at", { ascending: false });

  const editId = param(sp.edit);
  const row = editId ? templates?.find((t) => t.id === editId) : undefined;
  let editing: EditingTemplate | undefined;
  if (row && EDITABLE_STATUSES.includes(row.status)) {
    const f = formFromComponents(row.components, row.body);
    editing = {
      id: row.id,
      name: row.name,
      language: row.language,
      category: row.category,
      status: row.status,
      headerType: f.headerType,
      headerText: f.headerText,
      imageUrl: f.imageUrl,
      body: f.body,
      examples: f.examples,
      footer: f.footer,
      hasButtons: f.hasButtons,
    };
  }

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

      <TemplateForm key={editing?.id ?? "new"} editing={editing} />

      <h2 className="pt-2 text-lg font-semibold text-navy">Your templates</h2>
      <div className="card p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-line text-left text-muted">
            <tr>
              <th className="px-6 py-3 font-medium">Template</th>
              <th className="px-6 py-3 font-medium">Category</th>
              <th className="px-6 py-3 font-medium">Status</th>
              <th className="px-6 py-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {(templates ?? []).map((t) => (
              <tr key={`${t.name}-${t.language}`} className="border-b border-line last:border-0 align-top">
                <td className="px-6 py-4">
                  <div className="font-medium text-navy">
                    {t.name} <span className="text-muted">· {t.language}</span>
                  </div>
                  {(() => {
                    const v = templateView(t.components, t.body);
                    return (
                      <div className="mt-2 flex max-w-xl gap-3">
                        {v.header?.kind === "media" && v.header.sampleUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={v.header.sampleUrl} alt="" className="h-14 w-14 shrink-0 rounded object-cover" />
                        ) : v.header?.kind === "media" ? (
                          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded bg-navy-soft text-[10px] text-muted">{v.header.format}</div>
                        ) : null}
                        <div className="text-muted">
                          {v.header?.kind === "text" ? <div className="font-medium text-ink">{v.header.text}</div> : null}
                          <div className="whitespace-pre-wrap">{v.body}</div>
                          {v.footer ? <div className="mt-1 text-xs">{v.footer}</div> : null}
                          {v.buttons.length ? (
                            <div className="mt-1 text-xs text-[#027eb5]">{v.buttons.map((b) => `▸ ${b.text}`).join("   ")}</div>
                          ) : null}
                        </div>
                      </div>
                    );
                  })()}
                </td>
                <td className="px-6 py-4">{t.category}</td>
                <td className="px-6 py-4">
                  <span className={`rounded-full px-3 py-1 text-xs font-medium ${badge[t.status] ?? "bg-navy-soft text-navy"}`}>{t.status}</span>
                  {t.status === "PENDING" ? <div className="hint mt-1">Checked with Meta each time you open this page</div> : null}
                  {t.rejection_reason ? <div className="hint mt-1">{t.rejection_reason}</div> : null}
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-right">
                  {EDITABLE_STATUSES.includes(t.status) ? (
                    <Link href={`/templates?edit=${t.id}`} className="mr-4 text-sm font-medium text-navy hover:underline">
                      Edit
                    </Link>
                  ) : (
                    <span className="mr-4 text-xs text-muted" title="Meta doesn't allow edits while a template is in review">
                      Edit after review
                    </span>
                  )}
                  <DeleteTemplateButton id={t.id} name={t.name} />
                </td>
              </tr>
            ))}
            {!templates?.length ? (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-muted">
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
