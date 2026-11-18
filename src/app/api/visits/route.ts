import { NextResponse, type NextRequest } from "next/server";
import { businessForKey, recordIncomingVisit } from "@/lib/sequence/incoming";
import { parseIncomingVisit } from "@/lib/visits-in";

/**
 * Where billing apps and our client websites send each order or visit.
 * Authorization: Bearer <the business's key from its Connections card>.
 * Body and answers are described in src/lib/visits-in.ts.
 */
export async function POST(req: NextRequest) {
  const key = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const businessId = key ? await businessForKey(key) : null;
  if (!businessId) return NextResponse.json({ error: "Missing or wrong key" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Send JSON" }, { status: 400 });
  }
  const parsed = parseIncomingVisit(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 422 });

  try {
    const result = await recordIncomingVisit(businessId, parsed.value);
    return NextResponse.json(result, { status: result.duplicate ? 200 : 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't save the visit" }, { status: 500 });
  }
}
