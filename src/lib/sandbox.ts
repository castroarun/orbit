import "server-only";
import { env } from "./env";
import { supabaseAdmin } from "./supabase/server";

/**
 * Stage 1 works against Meta's free test number. This makes sure there is a
 * "sandbox" business row for it, so messages and templates have somewhere to live.
 */
export async function ensureSandboxBusiness() {
  const db = supabaseAdmin();
  const sb = env.sandbox();

  const { data: existing } = await db.from("businesses").select("*").eq("is_sandbox", true).maybeSingle();
  if (existing) {
    if (sb.phoneNumberId && (existing.wa_phone_number_id !== sb.phoneNumberId || existing.waba_id !== sb.wabaId)) {
      await db.from("businesses").update({ wa_phone_number_id: sb.phoneNumberId, waba_id: sb.wabaId }).eq("id", existing.id);
    }
    return { ...existing, wa_phone_number_id: sb.phoneNumberId || existing.wa_phone_number_id, waba_id: sb.wabaId || existing.waba_id };
  }

  const { data, error } = await db
    .from("businesses")
    .insert({
      name: "Orbit test (Meta test number)",
      owner_first_name: "Arun",
      is_sandbox: true,
      messaging_mode: "meta",
      wa_phone_number_id: sb.phoneNumberId || null,
      waba_id: sb.wabaId || null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

/** Access token for a business: sandbox uses the env token; clients use their stored token. */
export async function tokenFor(business: { id: string; is_sandbox: boolean }) {
  if (business.is_sandbox) return env.sandbox().accessToken;
  const { data } = await supabaseAdmin()
    .from("business_secrets")
    .select("meta_access_token")
    .eq("business_id", business.id)
    .maybeSingle();
  return data?.meta_access_token ?? "";
}
