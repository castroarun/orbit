import "server-only";
import { redirect } from "next/navigation";
import { ensureSandboxBusiness } from "./sandbox";
import { currentProfile, supabaseForUser } from "./supabase/server";

/** For stage-1 pages: agency only, works on the sandbox business. */
export async function loadSandbox() {
  const profile = await currentProfile();
  if (!profile?.is_agency) redirect("/no-access");
  const business = await ensureSandboxBusiness();
  const supabase = await supabaseForUser();
  return { business, supabase, profile };
}

/** For stage-2 pages: agency staff only (business owners get their own screens later). */
export async function loadAgency() {
  const profile = await currentProfile();
  if (!profile?.is_agency) redirect("/no-access");
  const supabase = await supabaseForUser();
  return { supabase, profile };
}

export type BusinessRow = {
  id: string;
  name: string;
  area: string | null;
  kind: string | null;
  owner_first_name: string | null;
  owner_phone: string | null;
  google_place_id: string | null;
  google_review_url: string | null;
  messaging_mode: "wame" | "meta" | "provider";
  languages: string[];
  status: "pilot" | "active" | "paused" | "ended";
  plan: string | null;
  notes: string | null;
  created_at: string;
};

export const BUSINESS_COLUMNS =
  "id, name, area, kind, owner_first_name, owner_phone, google_place_id, google_review_url, messaging_mode, languages, status, plan, notes, created_at";

/** Client businesses (never our Meta test number), A–Z. */
export async function listBusinesses(supabase: Awaited<ReturnType<typeof supabaseForUser>>) {
  const { data, error } = await supabase.from("businesses").select(BUSINESS_COLUMNS).eq("is_sandbox", false).order("name");
  if (error) throw error;
  return (data ?? []) as BusinessRow[];
}

/** Start of the current month in India, as an ISO timestamp. */
export function monthStartIST() {
  const now = new Date(Date.now() + 5.5 * 3600_000);
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) - 5.5 * 3600_000).toISOString();
}
