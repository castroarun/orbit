import "server-only";
import { friendlyMetaError } from "./meta/errors";
import { MetaApiError } from "./meta/graph";
import { listTemplates, type TemplateComponent } from "./meta/templates";
import { tokenFor } from "./sandbox";
import { supabaseAdmin } from "./supabase/server";

/**
 * Brings Orbit's template list in line with Meta: new templates, status changes
 * (approved / rejected / paused), and ones deleted in WhatsApp Manager.
 * Keeps Orbit's own copy of picture headings, which Meta doesn't return.
 */
export async function syncTemplatesFromMeta(business: { id: string; waba_id: string | null; is_sandbox: boolean }) {
  if (!business.waba_id) throw new Error("Set META_SANDBOX_WABA_ID first");
  const list = await listTemplates(business.waba_id, await tokenFor(business));
  const db = supabaseAdmin();
  const { data: existing } = await db
    .from("templates")
    .select("id, name, language, status, body, rejection_reason, components, meta_template_id")
    .eq("business_id", business.id);

  const now = new Date().toISOString();
  const rows = list.map((t) => {
    const old = existing?.find((e) => e.name === t.name && e.language === t.language);
    const ours = (old?.components as TemplateComponent[] | null)?.find((c) => c.type === "HEADER")?.orbit_image_url;
    const components = ours && t.components ? t.components.map((c) => (c.type === "HEADER" ? { ...c, orbit_image_url: ours } : c)) : (t.components ?? null);
    const body = t.components?.find((c) => c.type === "BODY")?.text ?? "";
    const rejection = t.rejected_reason && t.rejected_reason !== "NONE" ? t.rejected_reason : null;
    const changed = !old || old.status !== t.status || old.body !== body || old.rejection_reason !== rejection;
    return {
      business_id: business.id,
      name: t.name,
      language: t.language,
      category: t.category === "MARKETING" ? "MARKETING" : "UTILITY",
      body,
      components,
      meta_template_id: t.id,
      status: t.status,
      rejection_reason: rejection,
      ...(changed ? { updated_at: now } : {}),
    };
  });
  if (rows.length) await db.from("templates").upsert(rows, { onConflict: "business_id,name,language" });

  // Deleted at Meta (e.g. in WhatsApp Manager) → remove here too.
  const live = new Set(list.map((t) => t.id));
  const gone = (existing ?? []).filter((e) => e.meta_template_id && !live.has(e.meta_template_id)).map((e) => e.id);
  if (gone.length) await db.from("templates").delete().in("id", gone);

  return { count: list.length, removed: gone.length };
}

/** On page load: only call Meta when something is still waiting for review. */
export async function syncIfPending(business: { id: string; waba_id: string | null; is_sandbox: boolean }): Promise<string | null> {
  const { count } = await supabaseAdmin()
    .from("templates")
    .select("id", { count: "exact", head: true })
    .eq("business_id", business.id)
    .in("status", ["PENDING", "IN_APPEAL", "PENDING_DELETION"]);
  if (!count) return null;
  try {
    await syncTemplatesFromMeta(business);
    return null;
  } catch (e) {
    // Don't break the page, but say so: otherwise "Pending" may just be stale.
    return e instanceof MetaApiError ? friendlyMetaError(e.code, e.message, e.subcode) : e instanceof Error ? e.message : String(e);
  }
}
