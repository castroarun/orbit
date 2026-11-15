import { NextResponse, type NextRequest } from "next/server";
import { supabaseForUser } from "@/lib/supabase/server";

/** Google sends people back here after they sign in; swap the one-time code for a session. */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const url = req.nextUrl.clone();
  url.search = "";

  if (code) {
    const supabase = await supabaseForUser();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      url.pathname = "/";
      return NextResponse.redirect(url);
    }
    url.pathname = "/login";
    url.searchParams.set("error", error.message);
    return NextResponse.redirect(url);
  }

  url.pathname = "/login";
  url.searchParams.set("error", "Sign-in was cancelled");
  return NextResponse.redirect(url);
}
