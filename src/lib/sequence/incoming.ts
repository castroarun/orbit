import "server-only";
/**
 * A visit sent in by a billing app or one of our client websites
 * (POST /api/visits). Records the customer and visit, then starts the review
 * request if the business has automatic requests on and the customer agreed.
 */
import type { IncomingVisit } from "../visits-in";
import { supabaseAdmin } from "../supabase/server";
import { startReviewRequest } from "./engine";

export type IncomingResult = {
  visit_id: string | null;
  duplicate: boolean;
  review_request: "started" | "not started";
  note?: string;
};

export async function businessForKey(key: string) {
  if (!/^vk_[a-z2-9]{32}$/.test(key)) return null;
  const db = supabaseAdmin();
  const { data } = await db.from("business_secrets").select("business_id").eq("ingest_key", key).maybeSingle();
  return data?.business_id ?? null;
}

export async function recordIncomingVisit(businessId: string, v: IncomingVisit): Promise<IncomingResult> {
  const db = supabaseAdmin();
  const { data: b } = await db.from("businesses").select("id, languages, auto_requests, status").eq("id", businessId).single();
  if (!b) throw new Error("Business not found");

  // Customer: create, or fill gaps. Consent is only ever added; a STOP is never undone here.
  const now = new Date().toISOString();
  let { data: c } = await db.from("customers").select("id, name, consent_at, opted_out_at").eq("business_id", businessId).eq("phone", v.phone).maybeSingle();
  if (!c) {
    const { data, error } = await db
      .from("customers")
      .insert({
        business_id: businessId,
        phone: v.phone,
        name: v.name,
        language: v.language ?? ((b.languages as string[])?.[0] === "en" ? "en" : "ta"),
        consent_at: v.consent ? now : null,
        consent_source: v.consent ? v.source : null,
      })
      .select("id, name, consent_at, opted_out_at")
      .single();
    if (error) throw error;
    c = data;
    if (v.consent) await db.from("audit_log").insert({ business_id: businessId, action: "consent_given", details: { customer_id: c.id, source: v.source } });
  } else {
    const patch: Record<string, string> = {};
    if (!c.name && v.name) patch.name = v.name;
    if (v.consent && !c.consent_at && !c.opted_out_at) {
      patch.consent_at = now;
      patch.consent_source = v.source;
    }
    if (Object.keys(patch).length) {
      await db.from("customers").update(patch).eq("id", c.id);
      if (patch.consent_at) await db.from("audit_log").insert({ business_id: businessId, action: "consent_given", details: { customer_id: c.id, source: v.source } });
      c = { ...c, ...patch };
    }
  }

  // Visit: the same order number never counts twice.
  const { data: visit, error: vErr } = await db
    .from("visits")
    .insert({ business_id: businessId, customer_id: c.id, visited_at: v.visitedAt, source: v.source, external_ref: v.orderId })
    .select("id")
    .single();
  if (vErr) {
    if (vErr.code === "23505") return { visit_id: null, duplicate: true, review_request: "not started", note: "This order was already received" };
    throw vErr;
  }

  if (!b.auto_requests) return { visit_id: visit.id, duplicate: false, review_request: "not started", note: "Automatic review requests are off for this business" };
  if (b.status === "paused" || b.status === "ended") return { visit_id: visit.id, duplicate: false, review_request: "not started", note: `Business is ${b.status}` };
  const started = await startReviewRequest(visit.id);
  return "error" in started
    ? { visit_id: visit.id, duplicate: false, review_request: "not started", note: started.error }
    : { visit_id: visit.id, duplicate: false, review_request: "started" };
}
