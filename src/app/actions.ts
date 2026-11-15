"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { fillTemplate, createTemplate, listTemplates, toTemplateName, validateTemplate, type TemplateCategory } from "@/lib/meta/templates";
import { normalizePhone } from "@/lib/phone";
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
    const params = str(form, "params").split("|").map((s) => s.trim()).filter(Boolean);
    const { data: t } = await supabaseAdmin()
      .from("templates")
      .select("body")
      .eq("business_id", business.id)
      .eq("name", name)
      .eq("language", language)
      .maybeSingle();
    message = {
      kind: "template",
      to,
      templateName: name,
      language,
      bodyParams: params,
      previewText: t?.body ? fillTemplate(t.body, params) : name === "hello_world" ? "Hello World" : name,
    };
  }

  const result = await sendMessage({ business: { ...business, messaging_mode: mode }, message, sentBy: profile.id });
  revalidatePath("/messages");
  if (result.status === "sent") back("/", { ok: `Sent. Meta message id ${result.providerMessageId}` });
  if (result.status === "link") back("/", { link: result.link });
  back("/", { error: (result as { error: string }).error });
}

// ───────── templates (App Review video 2) ─────────

export async function createTemplateAction(form: FormData) {
  await requireAgency();
  const business = await ensureSandboxBusiness();
  const t = {
    name: toTemplateName(str(form, "name")),
    language: str(form, "language") || "en",
    category: (str(form, "category") || "UTILITY") as TemplateCategory,
    body: str(form, "body"),
    examples: str(form, "examples").split("|").map((s) => s.trim()),
  };

  const errors = validateTemplate(t);
  if (errors.length) back("/templates", { error: errors.join(". ") });
  if (!business.waba_id) back("/templates", { error: "Set META_SANDBOX_WABA_ID first" });

  try {
    const res = await createTemplate(business.waba_id!, await tokenFor(business), t);
    await supabaseAdmin()
      .from("templates")
      .upsert(
        {
          business_id: business.id,
          name: t.name,
          language: t.language,
          category: res.category ?? t.category,
          body: t.body,
          meta_template_id: res.id,
          status: res.status,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "business_id,name,language" },
      );
  } catch (e) {
    back("/templates", { error: e instanceof Error ? e.message : String(e) });
  }
  revalidatePath("/templates");
  back("/templates", { ok: `Template "${t.name}" sent to Meta for approval` });
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
      meta_template_id: t.id,
      status: t.status,
      rejection_reason: t.rejected_reason && t.rejected_reason !== "NONE" ? t.rejected_reason : null,
      updated_at: new Date().toISOString(),
    }));
    if (rows.length) await supabaseAdmin().from("templates").upsert(rows, { onConflict: "business_id,name,language" });
  } catch (e) {
    back("/templates", { error: e instanceof Error ? e.message : String(e) });
  }
  revalidatePath("/templates");
  back("/templates", { ok: "Templates refreshed from Meta" });
}
