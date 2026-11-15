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
