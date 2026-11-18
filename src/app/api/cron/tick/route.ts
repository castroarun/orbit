import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { runDueJobs } from "@/lib/sequence/engine";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Called once a minute by Supabase (pg_cron + pg_net, see migration 0004).
 * Runs review-sequence steps that are due. The caller must send the secret
 * kept in orbit.app_secrets, which only the database and this server can read.
 */
export const maxDuration = 60;

let cachedSecret: string | null = null;

async function cronSecret() {
  if (cachedSecret) return cachedSecret;
  const { data } = await supabaseAdmin().from("app_secrets").select("value").eq("key", "cron").maybeSingle();
  cachedSecret = data?.value ?? null;
  return cachedSecret;
}

function same(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function POST(req: NextRequest) {
  const given = req.headers.get("x-cron-secret") ?? "";
  const secret = await cronSecret();
  if (!secret || !given || !same(given, secret)) return new NextResponse("Forbidden", { status: 403 });
  const results = await runDueJobs();
  return NextResponse.json({ ran: results.length, results });
}
