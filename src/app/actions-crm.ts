"use server";

/**
 * Stage 2 server actions: businesses, customers, consent, visits and imports.
 * All writes go through the signed-in person's Supabase client, so row-level
 * security still decides what they may touch.
 */
import { redirect, unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";
import { businessFromForm } from "@/lib/business";
import { CONSENT_SOURCES, type ConsentSource } from "@/lib/consent";
import type { CleanRow } from "@/lib/import-check";
import { todayIST } from "@/lib/dates";
import { normalizePhone } from "@/lib/phone";
import { runDueJobs, startReviewRequest } from "@/lib/sequence/engine";
import { currentProfile, supabaseAdmin, supabaseForUser } from "@/lib/supabase/server";
import { makeIngestKey, parseIncomingVisit } from "@/lib/visits-in";
import { recordIncomingVisit } from "@/lib/sequence/incoming";

export type FormState = { error?: string } | undefined;

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const back: (path: string, params: Record<string, string>) => never = (path, params) => redirect(`${path}?${new URLSearchParams(params)}`);
const errorText = (e: unknown) => (e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String(e.message) : String(e));

async function requireAgency() {
  const profile = await currentProfile();
  if (!profile?.is_agency) redirect("/no-access");
  return profile;
}

function consentSource(v: string): ConsentSource {
  return (v in CONSENT_SOURCES ? v : "staff") as ConsentSource;
}

/** Visit dates are stored at noon India time so the day never shifts across time zones. */
const visitTimestamp = (isoDate: string) => `${isoDate}T12:00:00+05:30`;

// ───────── businesses ─────────

export async function saveBusiness(_prev: FormState, form: FormData): Promise<FormState> {
  const profile = await requireAgency();
  const parsed = businessFromForm(form);
  if (!parsed.ok) return { error: parsed.error };
  const id = str(form, "id");
  const supabase = await supabaseForUser();
  try {
    if (id) {
      const { error } = await supabase.from("businesses").update(parsed.value).eq("id", id).eq("is_sandbox", false);
      if (error) throw error;
      await supabase.from("audit_log").insert({ business_id: id, actor: profile.id, action: "business_updated", details: {} });
    } else {
      const { data, error } = await supabase
        .from("businesses")
        .insert({ ...parsed.value, messaging_mode: "wame" })
        .select("id")
        .single();
      if (error) throw error;
      await supabase.from("audit_log").insert({ business_id: data.id, actor: profile.id, action: "business_added", details: {} });
      revalidatePath("/", "layout");
      redirect(`/businesses/${data.id}?ok=${encodeURIComponent("Business added. Next: import its customers.")}`);
    }
  } catch (e) {
    unstable_rethrow(e);
    return { error: errorText(e) };
  }
  revalidatePath("/", "layout");
  redirect(`/businesses/${id}?ok=${encodeURIComponent("Saved")}`);
}

// ───────── customers ─────────

export async function addCustomer(_prev: FormState, form: FormData): Promise<FormState> {
  const profile = await requireAgency();
  const businessId = str(form, "business_id");
  const phone = normalizePhone(str(form, "phone"));
  if (!businessId) return { error: "Choose a business first" };
  if (!phone.ok) return { error: `WhatsApp number: ${phone.reason}` };
  const consent = form.get("consent") === "on";
  const source = consentSource(str(form, "consent_source"));
  const language = str(form, "language") === "en" ? "en" : "ta";

  const supabase = await supabaseForUser();
  const { data: existing } = await supabase
    .from("customers")
    .select("id")
    .eq("business_id", businessId)
    .eq("phone", phone.phone)
    .maybeSingle();
  if (existing) return { error: "This number is already a customer of this business. Search for it in the list." };

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("customers")
    .insert({
      business_id: businessId,
      name: str(form, "name") || null,
      phone: phone.phone,
      language,
      consent_at: consent ? now : null,
      consent_source: consent ? source : null,
    })
    .select("id")
    .single();
  if (error) return { error: errorText(error) };

  const visitDate = str(form, "visit_date");
  if (visitDate && (!/^\d{4}-\d{2}-\d{2}$/.test(visitDate) || visitDate > todayIST())) return { error: "Visit date can't be in the future" };
  if (visitDate) {
    await supabase.from("visits").insert({
      business_id: businessId,
      customer_id: data.id,
      visited_at: visitTimestamp(visitDate),
      source: "manual",
      created_by: profile.id,
    });
  }
  if (consent)
    await supabase.from("audit_log").insert({ business_id: businessId, actor: profile.id, action: "consent_given", details: { customer_id: data.id, source } });

  revalidatePath("/customers");
  redirect(`/customers?b=${businessId}&c=${data.id}&ok=${encodeURIComponent("Customer added")}`);
}

export async function updateCustomer(form: FormData) {
  await requireAgency();
  const id = str(form, "customer_id");
  const businessId = str(form, "business_id");
  const supabase = await supabaseForUser();
  const { error } = await supabase
    .from("customers")
    .update({ name: str(form, "name") || null, language: str(form, "language") === "en" ? "en" : "ta" })
    .eq("id", id);
  if (error) back("/customers", { b: businessId, c: id, error: errorText(error) });
  revalidatePath("/customers");
  back("/customers", { b: businessId, c: id, ok: "Saved" });
}

/** Records that the customer agreed to WhatsApp messages (and how). */
export async function recordConsent(form: FormData) {
  const profile = await requireAgency();
  const id = str(form, "customer_id");
  const businessId = str(form, "business_id");
  const source = consentSource(str(form, "consent_source"));
  const supabase = await supabaseForUser();
  const { error } = await supabase
    .from("customers")
    .update({ consent_at: new Date().toISOString(), consent_source: source })
    .eq("id", id)
    .is("opted_out_at", null);
  if (error) back("/customers", { b: businessId, c: id, error: errorText(error) });
  await supabase.from("audit_log").insert({ business_id: businessId, actor: profile.id, action: "consent_given", details: { customer_id: id, source } });
  revalidatePath("/customers");
  back("/customers", { b: businessId, c: id, ok: "Consent recorded" });
}

/** The customer asked for no more messages. Permanent: we never message them again. */
export async function stopMessages(form: FormData) {
  const profile = await requireAgency();
  const id = str(form, "customer_id");
  const businessId = str(form, "business_id");
  const supabase = await supabaseForUser();
  const now = new Date().toISOString();
  const { error } = await supabase.from("customers").update({ opted_out_at: now }).eq("id", id);
  if (error) back("/customers", { b: businessId, c: id, error: errorText(error) });
  await supabase
    .from("review_requests")
    .update({ stage: "stopped", stop_reason: "customer asked", completed_at: now })
    .eq("customer_id", id)
    .not("stage", "in", "(thanked,stopped,expired)");
  await supabase.from("audit_log").insert({ business_id: businessId, actor: profile.id, action: "opted_out", details: { customer_id: id, how: "recorded by staff" } });
  revalidatePath("/customers");
  back("/customers", { b: businessId, c: id, ok: "Messages stopped for this customer" });
}

export async function addVisit(form: FormData) {
  const profile = await requireAgency();
  const id = str(form, "customer_id");
  const businessId = str(form, "business_id");
  const date = str(form, "visit_date") || todayIST();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > todayIST()) back("/customers", { b: businessId, c: id, error: "Visit date can't be in the future" });
  const supabase = await supabaseForUser();
  const { error } = await supabase.from("visits").insert({
    business_id: businessId,
    customer_id: id,
    visited_at: visitTimestamp(date),
    source: "manual",
    created_by: profile.id,
  });
  if (error) back("/customers", { b: businessId, c: id, error: errorText(error) });
  revalidatePath("/customers");
  back("/customers", { b: businessId, c: id, ok: "Visit recorded" });
}

// ───────── import ─────────

export type ImportResult =
  | { error?: string; added?: number; updated?: number; visits?: number; consented?: number; started?: number; notStarted?: string[] }
  | undefined;

const MAX_IMPORT_ROWS = 5000;

/**
 * Saves checked rows from the Import screen. Existing customers (same number)
 * are filled in, never overwritten: a name already saved stays, consent is
 * only added, and someone who asked to stop stays stopped.
 */
export async function importCustomers(payload: {
  businessId: string;
  rows: CleanRow[];
  consentSource: string;
  fileName: string;
  /** Daily list: start review messages for visits dated today or yesterday. */
  startRecent?: boolean;
}): Promise<ImportResult> {
  const profile = await requireAgency();
  const { businessId, rows } = payload;
  if (!businessId) return { error: "Choose a business first" };
  if (!rows.length) return { error: "Nothing to import" };
  if (rows.length > MAX_IMPORT_ROWS) return { error: `Up to ${MAX_IMPORT_ROWS} customers per file. Split the file and import in parts.` };

  // Never trust the browser: re-check every number.
  const clean: CleanRow[] = [];
  for (const r of rows) {
    const p = normalizePhone(String(r.phone ?? ""));
    if (!p.ok) continue;
    clean.push({
      row: Number(r.row) || 0,
      phone: p.phone,
      name: r.name ? String(r.name).slice(0, 120) : null,
      language: r.language === "en" || r.language === "ta" ? r.language : null,
      visitDate: typeof r.visitDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.visitDate) ? r.visitDate : null,
      consent: r.consent === true,
    });
  }
  const source = consentSource(payload.consentSource);
  const supabase = await supabaseForUser();

  try {
    const { data: biz, error: bizErr } = await supabase.from("businesses").select("id, languages").eq("id", businessId).single();
    if (bizErr) throw bizErr;
    const defaultLang = (biz.languages as string[])?.[0] === "en" ? "en" : "ta";
    const now = new Date().toISOString();

    // Who is already a customer?
    const existing = new Map<string, { id: string; name: string | null; consent_at: string | null; opted_out_at: string | null }>();
    for (let i = 0; i < clean.length; i += 300) {
      const chunk = clean.slice(i, i + 300).map((r) => r.phone);
      const { data, error } = await supabase
        .from("customers")
        .select("id, phone, name, consent_at, opted_out_at")
        .eq("business_id", businessId)
        .in("phone", chunk);
      if (error) throw error;
      for (const c of data ?? []) existing.set(c.phone, c);
    }

    // New customers, in batches.
    const fresh = clean.filter((r) => !existing.has(r.phone));
    for (let i = 0; i < fresh.length; i += 500) {
      const { data, error } = await supabase
        .from("customers")
        .insert(
          fresh.slice(i, i + 500).map((r) => ({
            business_id: businessId,
            name: r.name,
            phone: r.phone,
            language: r.language ?? defaultLang,
            consent_at: r.consent ? now : null,
            consent_source: r.consent ? source : null,
          })),
        )
        .select("id, phone, name, consent_at, opted_out_at");
      if (error) throw error;
      for (const c of data ?? []) existing.set(c.phone, c);
    }

    // Existing customers: fill gaps only.
    let updated = 0;
    const freshPhones = new Set(fresh.map((r) => r.phone));
    const updates = clean
      .filter((r) => !freshPhones.has(r.phone))
      .map((r) => {
        const c = existing.get(r.phone)!;
        const patch: Record<string, string> = {};
        if (!c.name && r.name) patch.name = r.name;
        if (r.consent && !c.consent_at && !c.opted_out_at) {
          patch.consent_at = now;
          patch.consent_source = source;
        }
        return { id: c.id, patch };
      })
      .filter((u) => Object.keys(u.patch).length);
    for (let i = 0; i < updates.length; i += 20) {
      const results = await Promise.all(updates.slice(i, i + 20).map((u) => supabase.from("customers").update(u.patch).eq("id", u.id)));
      const failed = results.find((r) => r.error);
      if (failed?.error) throw failed.error;
      updated += results.length;
    }

    // Visits from the file, skipping ones already imported for the same day.
    const withVisit = clean.filter((r) => r.visitDate);
    const ids = withVisit.map((r) => existing.get(r.phone)!.id);
    const seen = new Set<string>();
    for (let i = 0; i < ids.length; i += 300) {
      const { data, error } = await supabase.from("visits").select("customer_id, visited_at").in("customer_id", ids.slice(i, i + 300));
      if (error) throw error;
      for (const v of data ?? []) seen.add(`${v.customer_id}|${new Date(new Date(v.visited_at).getTime() + 5.5 * 3600_000).toISOString().slice(0, 10)}`);
    }
    const visitRows = withVisit
      .map((r) => ({ customer_id: existing.get(r.phone)!.id, date: r.visitDate! }))
      .filter((v) => !seen.has(`${v.customer_id}|${v.date}`))
      .map((v) => ({ business_id: businessId, customer_id: v.customer_id, visited_at: visitTimestamp(v.date), source: "import", created_by: profile.id }));
    const newVisits: { id: string; visited_at: string }[] = [];
    for (let i = 0; i < visitRows.length; i += 500) {
      const { data, error } = await supabase.from("visits").insert(visitRows.slice(i, i + 500)).select("id, visited_at");
      if (error) throw error;
      newVisits.push(...(data ?? []));
    }

    // Daily list: ask the customers who visited today or yesterday (India time).
    let started = 0;
    const notStarted: string[] = [];
    if (payload.startRecent) {
      const today = todayIST();
      const yesterday = todayIST(Date.now() - 86_400_000);
      for (const v of newVisits) {
        const day = new Date(new Date(v.visited_at).getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);
        if (day !== today && day !== yesterday) continue;
        const r = await startReviewRequest(v.id);
        if ("error" in r) notStarted.push(r.error);
        else started++;
      }
    }

    const consented = clean.filter((r) => r.consent).length;
    await supabase.from("audit_log").insert({
      business_id: businessId,
      actor: profile.id,
      action: "customers_imported",
      details: { file: payload.fileName.slice(0, 200), rows: clean.length, added: fresh.length, updated, visits: visitRows.length, consented, consent_source: source },
    });

    revalidatePath("/", "layout");
    return { added: fresh.length, updated, visits: visitRows.length, consented, started, notStarted };
  } catch (e) {
    unstable_rethrow(e);
    return { error: errorText(e) };
  }
}

// ───────── review requests ─────────

/** "Visit done, ask for a review": records today's visit and starts the sequence. */
export async function startReview(form: FormData) {
  const profile = await requireAgency();
  const id = str(form, "customer_id");
  const businessId = str(form, "business_id");
  const supabase = await supabaseForUser();
  const { data: visit, error } = await supabase
    .from("visits")
    .insert({ business_id: businessId, customer_id: id, visited_at: new Date().toISOString(), source: "staff", created_by: profile.id })
    .select("id")
    .single();
  if (error) back("/customers", { b: businessId, c: id, error: errorText(error) });
  const started = await startReviewRequest(visit!.id);
  revalidatePath("/customers");
  if ("error" in started) back("/customers", { b: businessId, c: id, error: `Visit recorded, but the review request didn't start: ${started.error}` });
  const at = (started as { firstStepAt: Date }).firstStepAt.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false });
  back("/customers", { b: businessId, c: id, ok: `Review request started. Check-in message goes at ${at}.` });
}

/** Runs due steps immediately instead of waiting for the next minute's tick. */
export async function runDueNow(form: FormData) {
  await requireAgency();
  const returnTo = str(form, "return_to") || "/";
  const results = await runDueJobs();
  revalidatePath("/", "layout");
  const failed = results.filter((r) => r.outcome.startsWith("failed"));
  const msg = results.length ? `Ran ${results.length} step(s)${failed.length ? `, ${failed.length} failed: ${failed[0].outcome.slice(8)}` : ""}` : "Nothing was due yet";
  redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}${new URLSearchParams(failed.length ? { error: msg } : { ok: msg })}`);
}

// ───────── connections ─────────

/** Creates (or replaces) the key a billing app or client website uses to send visits. */
export async function rotateIngestKey(form: FormData) {
  const profile = await requireAgency();
  const businessId = str(form, "business_id");
  // Confirm the person can see this business before touching its server-only secret.
  const supabase = await supabaseForUser();
  const { data: b } = await supabase.from("businesses").select("id").eq("id", businessId).maybeSingle();
  if (!b) back(`/businesses/${businessId}`, { error: "Business not found" });
  const key = makeIngestKey();
  const { error } = await supabaseAdmin()
    .from("business_secrets")
    .upsert({ business_id: businessId, ingest_key: key, updated_at: new Date().toISOString() }, { onConflict: "business_id" });
  if (error) back(`/businesses/${businessId}`, { error: errorText(error) });
  await supabase.from("audit_log").insert({ business_id: businessId, actor: profile.id, action: "visit_key_created", details: {} });
  revalidatePath(`/businesses/${businessId}`);
  back(`/businesses/${businessId}`, { ok: "New key created. Any app using the old key must be updated." });
}

/** Connections card: sends a sample order through the same path a billing app or website uses. */
export async function sendTestOrder(form: FormData) {
  await requireAgency();
  const businessId = str(form, "business_id");
  const supabase = await supabaseForUser();
  const { data: b } = await supabase.from("businesses").select("id").eq("id", businessId).maybeSingle();
  if (!b) back(`/businesses/${businessId}`, { error: "Business not found" });
  const parsed = parseIncomingVisit({
    phone: str(form, "phone"),
    name: str(form, "name") || null,
    consent: form.get("consent") === "on",
    order_id: `TEST-${Date.now().toString(36).toUpperCase()}`,
    source: str(form, "source") === "website" ? "website" : "billing",
  });
  if (!parsed.ok) back(`/businesses/${businessId}`, { error: `Test order: ${parsed.error}` });
  const r = await recordIncomingVisit(businessId, (parsed as { ok: true; value: Parameters<typeof recordIncomingVisit>[1] }).value);
  revalidatePath("/", "layout");
  back(`/businesses/${businessId}`, {
    ok: `Test order received: visit recorded, review request ${r.review_request}${r.note ? ` (${r.note})` : ""}.`,
  });
}
