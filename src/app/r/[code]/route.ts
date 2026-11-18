import { NextResponse, type NextRequest } from "next/server";
import { recordTap } from "@/lib/sequence/engine";

/**
 * Tracked review link: /r/<code>. Logs the tap, then opens the business's
 * Google "write a review" box. A tap means they opened Google's page, not
 * that they posted (Google never says who wrote a review).
 */
export async function GET(req: NextRequest, ctx: RouteContext<"/r/[code]">) {
  const { code } = await ctx.params;
  const target = /^[a-z0-9]{4,12}$/.test(code) ? await recordTap(code, req.headers.get("user-agent")) : null;
  if (!target) return new NextResponse("This link has expired or is not valid.", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  return NextResponse.redirect(target, { status: 302, headers: { "cache-control": "no-store" } });
}
