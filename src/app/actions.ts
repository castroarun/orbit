"use server";

import { headers } from "next/headers";
import { redirect, unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";
import { componentsToStore, countPlaceholders, createTemplate, deleteTemplate, EDITABLE_STATUSES, editTemplate, formFromComponents, toTemplateName, validateTemplate, type NewTemplate, type TemplateCategory } from "@/lib/meta/templates";
import { uploadSampleToMeta } from "@/lib/meta/upload";
import { checkImage, storePublicImage } from "@/lib/storage";
import { env } from "@/lib/env";
import { friendlyMetaError } from "@/lib/meta/errors";
import { MetaApiError } from "@/lib/meta/graph";
import { normalizePhone } from "@/lib/phone";
import { fillBlanks, templateView } from "@/lib/meta/template-view";
import { ensureSandboxBusiness, tokenFor } from "@/lib/sandbox";
import { sendMessage } from "@/lib/send";
import { syncTemplatesFromMeta } from "@/lib/template-sync";
import { currentProfile, supabaseAdmin, supabaseForUser } from "@/lib/supabase/server";
import type { MessagingMode, OutgoingMessage } from "@/lib/messaging";

/** Meta errors in plain language; anything else as-is. */
const errorText = (e: unknown) =>
  e instanceof MetaApiError ? friendlyMetaError(e.code, e.message, e.subcode) : e instanceof Error ? e.message : String(e);

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const back: (path: string, params: Record<string, string>) => never = (path, params) => redirect(`${path}?${new URLSearchParams(params)}`);

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
  if (!phone.ok) back("/send", { error: `Phone number: ${phone.reason}` });
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
    if (!view.sendable) back("/send", { error: view.reason ?? "This template can't be sent from here yet" });

    // One box per {{n}} blank: param_1, param_2, …
    const params = Array.from({ length: view.blanks }, (_, i) => str(form, `param_${i + 1}`));
    const missing = params.findIndex((p) => !p);
    if (missing >= 0) back("/send", { error: `Fill in {{${missing + 1}}} before sending` });

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
        if (problem) back("/send", { error: problem });
        headerImageUrl = await storePublicImage(business.id, file);
      } else {
        headerImageUrl = view.header.sampleUrl;
      }
      if (!headerImageUrl) back("/send", { error: "This template needs a picture: choose one for this send" });
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
  if (result.status === "sent") back("/send", { ok: "sent" });
  if (result.status === "link") back("/send", { link: result.link });
  back("/send", { error: (result as { error: string }).error });
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

/** Errors come back to the form (so nothing typed is lost); success redirects with a notice. */
export type TemplateFormState = { error?: string };

export async function createTemplateAction(_prev: TemplateFormState, form: FormData): Promise<TemplateFormState> {
  await requireAgency();
  const business = await ensureSandboxBusiness();
  if (!business.waba_id) return { error: "Set META_SANDBOX_WABA_ID first" };
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
    return { error: errorText(e) };
  }
  revalidatePath("/templates");
  back("/templates", { ok: `Template "${name}" sent to Meta for approval` });
}

export async function editTemplateAction(_prev: TemplateFormState, form: FormData): Promise<TemplateFormState> {
  await requireAgency();
  const business = await ensureSandboxBusiness();
  const token = await tokenFor(business);
  const id = str(form, "template_row_id");

  const db = supabaseAdmin();
  const { data: row } = await db.from("templates").select("*").eq("id", id).eq("business_id", business.id).maybeSingle();
  if (!row) return { error: "Template not found" };
  if (!EDITABLE_STATUSES.includes(row!.status)) return { error: `Meta doesn't allow editing while the template is ${row!.status}` };
  if (!row!.meta_template_id) return { error: "This template has no Meta id; refresh from Meta first" };

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
    return { error: errorText(e) };
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
    back("/templates", { error: errorText(e) });
  }
  revalidatePath("/templates");
  back("/templates", { ok: `Deleted "${row!.name}" (${row!.language}). That name can't be reused for 30 days.` });
}

/** Pull the current list (and approval status) from Meta. */
export async function syncTemplates() {
  await requireAgency();
  const business = await ensureSandboxBusiness();
  let msg = "";
  try {
    const r = await syncTemplatesFromMeta(business);
    msg = `Up to date with Meta: ${r.count} template${r.count === 1 ? "" : "s"}${r.removed ? `, ${r.removed} removed (deleted at Meta)` : ""}`;
  } catch (e) {
    unstable_rethrow(e);
    back("/templates", { error: errorText(e) });
  }
  revalidatePath("/templates");
  back("/templates", { ok: msg });
}
