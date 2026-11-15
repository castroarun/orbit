"use server";

import { headers } from "next/headers";
import { redirect, unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";
import { componentsToStore, countPlaceholders, createTemplate, deleteTemplate, EDITABLE_STATUSES, editTemplate, formFromComponents, listTemplates, toTemplateName, validateTemplate, type NewTemplate, type TemplateCategory, type TemplateComponent } from "@/lib/meta/templates";
import { uploadSampleToMeta } from "@/lib/meta/upload";
import { checkImage, storePublicImage } from "@/lib/storage";
import { env } from "@/lib/env";
import { normalizePhone } from "@/lib/phone";
import { fillBlanks, templateView } from "@/lib/meta/template-view";
import { ensureSandboxBusiness, tokenFor } from "@/lib/sandbox";
import { sendMessage } from "@/lib/send";
import { currentProfile, supabaseAdmin, supabaseForUser } from "@/lib/supabase/server";
import type { MessagingMode, OutgoingMessage } from "@/lib/messaging";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const back = (path: string, params: Record<string, string>) => redirect(`${path}?${new URLSearchParams(params)}`);

async function requireAgency() {
  const profile = await currentProfile();
  if (!profile?.is_agency) redirect("/no-access");
  return profile;
}

// ───────── login ─────────

export async function signIn(form: FormData) {
  const supabase = await supabaseForUser();
  const { error } = await supabase.auth.signInWithPassword({ email: str(form, "email"), password: str(form, "password") });
  if (error) back("/login", { error: error.message });
  redirect("/");
}

export async function signInWithGoogle() {
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
  const supabase = await supabaseForUser();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${origin}/auth/callback` },
  });
  if (error || !data.url) back("/login", { error: error?.message ?? "Google sign-in unavailable" });
  redirect(data.url!);
}

export async function signOut() {
  const supabase = await supabaseForUser();
  await supabase.auth.signOut();
  redirect("/login");
}

// ───────── send a test message (App Review video 1) ─────────

export async function sendTest(form: FormData) {
  const profile = await requireAgency();
  const business = await ensureSandboxBusiness();

  const phone = normalizePhone(str(form, "to"));
  if (!phone.ok) back("/", { error: `Phone number: ${phone.reason}` });
  const to = (phone as { phone: string }).phone;

  const kind = str(form, "kind");
  const mode = (str(form, "mode") || "meta") as MessagingMode;
  let message: OutgoingMessage;

  if (kind === "text") {
    message = { kind: "text", to, text: str(form, "text") || "Hello from Orbit" };
  } else {
    const [name, language] = (str(form, "template") || "hello_world|en_US").split("|");
    const { data: t } = await supabaseAdmin()
      .from("templates")
      .select("body, components")
      .eq("business_id", business.id)
      .eq("name", name)
      .eq("language", language)
      .maybeSingle();
    const view = templateView(t?.components, t?.body ?? "");
    if (!view.sendable) back("/", { error: view.reason ?? "This template can't be sent from here yet" });

    // One box per {{n}} blank: param_1, param_2, …
    const params = Array.from({ length: view.blanks }, (_, i) => str(form, `param_${i + 1}`));
    const missing = params.findIndex((p) => !p);
    if (missing >= 0) back("/", { error: `Fill in {{${missing + 1}}} before sending` });

    const preview = [
      view.header?.kind === "text" ? view.header.text : "",
      fillBlanks(view.body, params),
      view.footer ?? "",
    ]
      .filter(Boolean)
      .join("\n\n");

    let headerImageUrl: string | undefined;
    if (view.header?.kind === "media" && view.header.format === "IMAGE") {
      const file = form.get("header_image") as File | null;
      if (file && file.size > 0) {
        const problem = checkImage(file);
        if (problem) back("/", { error: problem });
        headerImageUrl = await storePublicImage(business.id, file);
      } else {
        headerImageUrl = view.header.sampleUrl;
      }
      if (!headerImageUrl) back("/", { error: "This template needs a picture: choose one for this send" });
    }

    message = {
      kind: "template",
      to,
      templateName: name,
      language,
      bodyParams: params,
      headerImageUrl,
      previewText: preview || name,
    };
  }

  const result = await sendMessage({ business: { ...business, messaging_mode: mode }, message, sentBy: profile.id });
  revalidatePath("/messages");
  if (result.status === "sent") back("/", { ok: "sent" });
  if (result.status === "link") back("/", { link: result.link });
  back("/", { error: (result as { error: string }).error });
}

// ───────── templates (App Review video 2) ─────────

/** Reads the builder form into a template; uploads a new picture if one was chosen. */
async function templateFromForm(
  form: FormData,
  business: { id: string },
  token: string,
  keep?: { name: string; language: string; category: TemplateCategory; imageHandle?: string; imageUrl?: string },
): Promise<NewTemplate> {
  const body = str(form, "body");
  const blanks = countPlaceholders(body);
  const t: NewTemplate = {
    name: keep?.name ?? toTemplateName(str(form, "name")),
    language: keep?.language ?? (str(form, "language") || "en"),
    category: keep?.category ?? ((str(form, "category") || "UTILITY") as TemplateCategory),
    body,
    examples: Array.from({ length: blanks }, (_, i) => str(form, `example_${i + 1}`)),
    footer: str(form, "footer") || undefined,
  };

  const headerType = str(form, "header_type");
  if (headerType === "TEXT") t.header = { type: "TEXT", text: str(form, "header_text") };
  if (headerType === "IMAGE") {
    const file = form.get("header_image") as File | null;
    if (file && file.size > 0) {
      const problem = checkImage(file);
      if (problem) throw new Error(problem);
      const imageUrl = await storePublicImage(business.id, file);
      const handle = await uploadSampleToMeta({
        appId: env.metaAppId(),
        token,
        bytes: await file.arrayBuffer(),
        fileType: file.type,
        fileName: file.name || "sample.jpg",
      });
      t.header = { type: "IMAGE", handle, imageUrl };
    } else if (keep?.imageHandle) {
      t.header = { type: "IMAGE", handle: keep.imageHandle, imageUrl: keep.imageUrl ?? "" };
    } else {
      throw new Error("Choose a picture");
    }
  }

  const errors = validateTemplate(t);
  if (errors.length) throw new Error(errors.join(". "));
  return t;
}

export async function createTemplateAction(form: FormData) {
  await requireAgency();
  const business = await ensureSandboxBusiness();
  if (!business.waba_id) back("/templates", { error: "Set META_SANDBOX_WABA_ID first" });
  const token = await tokenFor(business);

  let name = "";
  try {
    const t = await templateFromForm(form, business, token);
    name = t.name;
    const res = await createTemplate(business.waba_id!, token, t);
    await supabaseAdmin()
      .from("templates")
      .upsert(
        {
          business_id: business.id,
          name: t.name,
          language: t.language,
          category: res.category ?? t.category,
          body: t.body,
          components: componentsToStore(t),
          meta_template_id: res.id,
          status: res.status,
          rejection_reason: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "business_id,name,language" },
      );
  } catch (e) {
    unstable_rethrow(e);
    back("/templates", { error: e instanceof Error ? e.message : String(e) });
  }
  revalidatePath("/templates");
  back("/templates", { ok: `Template "${name}" sent to Meta for approval` });
}

export async function editTemplateAction(form: FormData) {
  await requireAgency();
  const business = await ensureSandboxBusiness();
  const token = await tokenFor(business);
  const id = str(form, "template_row_id");

  const db = supabaseAdmin();
  const { data: row } = await db.from("templates").select("*").eq("id", id).eq("business_id", business.id).maybeSingle();
  if (!row) back("/templates", { error: "Template not found" });
  if (!EDITABLE_STATUSES.includes(row!.status)) back("/templates", { error: `Meta doesn't allow editing while the template is ${row!.status}` });
  if (!row!.meta_template_id) back("/templates", { error: "This template has no Meta id; refresh from Meta first" });

  try {
    const prev = formFromComponents(row!.components, row!.body);
    const categoryLocked = row!.status === "APPROVED";
    const t = await templateFromForm(form, business, token, {
      name: row!.name,
      language: row!.language,
      category: categoryLocked ? row!.category : ((str(form, "category") || row!.category) as TemplateCategory),
      imageHandle: prev.imageHandle,
      imageUrl: prev.imageUrl,
    });
    await editTemplate(row!.meta_template_id, token, t, { includeCategory: !categoryLocked });
    await db
      .from("templates")
      .update({
        category: t.category,
        body: t.body,
        components: componentsToStore(t),
        status: "PENDING",
        rejection_reason: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row!.id);
  } catch (e) {
    unstable_rethrow(e);
    back("/templates", { edit: id, error: e instanceof Error ? e.message : String(e) });
  }
  revalidatePath("/templates");
  back("/templates", { ok: `Changes to "${row!.name}" sent to Meta for review` });
}

export async function deleteTemplateAction(form: FormData) {
  await requireAgency();
  const business = await ensureSandboxBusiness();
  const id = str(form, "template_row_id");
  const db = supabaseAdmin();
  const { data: row } = await db.from("templates").select("*").eq("id", id).eq("business_id", business.id).maybeSingle();
  if (!row) back("/templates", { error: "Template not found" });

  try {
    if (row!.meta_template_id && business.waba_id) {
      await deleteTemplate(business.waba_id, await tokenFor(business), row!.name, row!.meta_template_id);
    }
    await db.from("templates").delete().eq("id", row!.id);
  } catch (e) {
    unstable_rethrow(e);
    back("/templates", { error: e instanceof Error ? e.message : String(e) });
  }
  revalidatePath("/templates");
  back("/templates", { ok: `Deleted "${row!.name}" (${row!.language}). That name can't be reused for 30 days.` });
}

/** Pull the current list (and approval status) from Meta. */
export async function syncTemplates() {
  await requireAgency();
  const business = await ensureSandboxBusiness();
  if (!business.waba_id) back("/templates", { error: "Set META_SANDBOX_WABA_ID first" });

  try {
    const list = await listTemplates(business.waba_id!, await tokenFor(business));
    const rows = list.map((t) => ({
      business_id: business.id,
      name: t.name,
      language: t.language,
      category: t.category === "MARKETING" ? "MARKETING" : "UTILITY",
      body: t.components?.find((c) => c.type === "BODY")?.text ?? "",
      components: t.components ?? null,
      meta_template_id: t.id,
      status: t.status,
      rejection_reason: t.rejected_reason && t.rejected_reason !== "NONE" ? t.rejected_reason : null,
      updated_at: new Date().toISOString(),
    }));
    // Keep Orbit's own copy of picture headings, which Meta doesn't return.
    const { data: existing } = await supabaseAdmin().from("templates").select("name, language, components").eq("business_id", business.id);
    for (const r of rows) {
      const old = existing?.find((e) => e.name === r.name && e.language === r.language);
      const ours = (old?.components as TemplateComponent[] | null)?.find((c) => c.type === "HEADER")?.orbit_image_url;
      if (ours && r.components) r.components = r.components.map((c) => (c.type === "HEADER" ? { ...c, orbit_image_url: ours } : c));
    }
    if (rows.length) await supabaseAdmin().from("templates").upsert(rows, { onConflict: "business_id,name,language" });
  } catch (e) {
    back("/templates", { error: e instanceof Error ? e.message : String(e) });
  }
  revalidatePath("/templates");
  back("/templates", { ok: "Templates refreshed from Meta" });
}
