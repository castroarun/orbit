import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { isStopMessage } from "@/lib/messaging/rules";
import { verifyMetaSignature } from "@/lib/meta/signature";
import { parseWebhook, type WebhookEvent } from "@/lib/meta/webhook";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Meta WhatsApp webhook.
 * GET  = Meta checks the URL once when we register it (echo hub.challenge).
 * POST = incoming customer messages, delivery statuses, template approvals.
 */

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  if (p.get("hub.mode") === "subscribe" && p.get("hub.verify_token") === env.metaVerifyToken()) {
    return new NextResponse(p.get("hub.challenge") ?? "", { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!verifyMetaSignature(raw, req.headers.get("x-hub-signature-256"), env.metaAppSecret())) {
    return new NextResponse("Bad signature", { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new NextResponse("Bad JSON", { status: 400 });
  }

  const events = parseWebhook(payload);
  try {
    for (const e of events) await handle(e);
  } catch (err) {
    // Log and still answer 200: Meta retries failed deliveries for days, which would duplicate work.
    console.error("webhook handling failed", err);
  }
  return NextResponse.json({ ok: true });
}

async function businessByPhoneNumberId(phoneNumberId: string) {
  const { data } = await supabaseAdmin().from("businesses").select("id").eq("wa_phone_number_id", phoneNumberId).maybeSingle();
  return data?.id as string | undefined;
}

async function handle(e: WebhookEvent) {
  const db = supabaseAdmin();

  if (e.type === "inbound") {
    const businessId = await businessByPhoneNumberId(e.phoneNumberId);
    if (!businessId) return console.warn("message for unknown phone number id", e.phoneNumberId);

    const { data: customer } = await db
      .from("customers")
      .select("id")
      .eq("business_id", businessId)
      .eq("phone", e.from)
      .maybeSingle();

    await db.from("messages").upsert(
      {
        business_id: businessId,
        customer_id: customer?.id ?? null,
        direction: "in",
        kind: e.messageType,
        phone: e.from,
        body: e.text,
        wa_message_id: e.waMessageId,
        status: "received",
        created_at: e.timestamp.toISOString(),
        status_at: e.timestamp.toISOString(),
      },
      { onConflict: "wa_message_id", ignoreDuplicates: true },
    );

    // Ground rule: STOP / வேண்டாம் ends all messages at once.
    if (isStopMessage(e.text) && customer) {
      await db.from("customers").update({ opted_out_at: new Date().toISOString() }).eq("id", customer.id);
      await db.from("audit_log").insert({
        business_id: businessId,
        action: "opted_out",
        details: { customer_id: customer.id, via: "whatsapp", text: e.text },
      });
    }
    // Stage 3 adds: complaint detection and moving review requests to the next step.
    return;
  }

  if (e.type === "status") {
    // Statuses can arrive out of order (read before delivered); never move backwards.
    const rank: Record<string, number> = { link: 0, queued: 0, sent: 1, delivered: 2, read: 3, failed: 4 };
    const { data: current } = await db.from("messages").select("status").eq("wa_message_id", e.waMessageId).maybeSingle();
    if (!current) return;
    if ((rank[e.status] ?? 0) <= (rank[current.status] ?? 0)) return;

    await db
      .from("messages")
      .update({
        status: e.status === "failed" ? "failed" : e.status,
        status_at: e.timestamp.toISOString(),
        ...(e.pricingCategory ? { price_category: e.pricingCategory } : {}),
        ...(e.error ? { error: e.error } : {}),
      })
      .eq("wa_message_id", e.waMessageId);
    return;
  }

  if (e.type === "template_status") {
    await db
      .from("templates")
      .update({ status: e.event, rejection_reason: e.reason ?? null, updated_at: new Date().toISOString() })
      .eq("meta_template_id", e.templateId);
  }
}
