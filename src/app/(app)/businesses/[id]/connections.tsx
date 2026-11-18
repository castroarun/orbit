import { rotateIngestKey, sendTestOrder } from "../../../actions-crm";
import { linkBase } from "@/lib/sequence/engine";
import { supabaseAdmin } from "@/lib/supabase/server";
import { PendingButton } from "../../pending-button";
import { Section } from "../../ui";

/**
 * How visits reach Orbit without anyone pressing a button: the billing app or
 * the client's website (one we build) sends each order to /api/visits with
 * this business's key. Agency-only screen; the key is shown here only.
 */
export async function Connections({ businessId, autoRequests }: { businessId: string; autoRequests: boolean }) {
  const { data } = await supabaseAdmin().from("business_secrets").select("ingest_key").eq("business_id", businessId).maybeSingle();
  const key = data?.ingest_key ?? null;
  const endpoint = `${linkBase()}/api/visits`;
  const example = `curl -X POST ${endpoint} \\
  -H "Authorization: Bearer ${key ?? "<key>"}" \\
  -H "Content-Type: application/json" \\
  -d '{"phone":"98404 12314","name":"Priya","consent":true,"order_id":"INV-2041","source":"website"}'`;

  return (
    <Section title="Connections">
      <div className="card space-y-3 p-4 text-[13.5px]">
        <p>
          Billing app or website → Orbit: each order or bill sent here becomes a visit, and{" "}
          {autoRequests ? "a review request starts automatically" : "is saved (automatic requests are off in Edit)"}. Daily lists go
          through Import.
        </p>
        {key ? (
          <>
            <div>
              <div className="hint">Address</div>
              <code className="block rounded bg-canvas px-2 py-1 text-[12.5px] break-all">{endpoint}</code>
            </div>
            <details>
              <summary className="cursor-pointer text-link">Show key and example</summary>
              <div className="mt-2 space-y-2">
                <code className="block rounded bg-canvas px-2 py-1 text-[12.5px] break-all">{key}</code>
                <p className="hint">Keep it private: anyone with it can add visits. Give it only to the developer setting up the link.</p>
                <pre className="overflow-x-auto rounded bg-canvas p-2 text-[12px] leading-relaxed">{example}</pre>
                <p className="hint">
                  Needs phone. consent = did they agree to WhatsApp messages (tick box at checkout or billing). order_id stops the
                  same order counting twice.
                </p>
              </div>
            </details>
          </>
        ) : (
          <p className="hint">No key yet. Create one when you&apos;re ready to connect the billing app or website.</p>
        )}
        <form action={rotateIngestKey}>
          <input type="hidden" name="business_id" value={businessId} />
          <PendingButton label={key ? "Replace key" : "Create key"} pendingLabel="Creating…" className="btn-ghost" />
        </form>
        <details className="border-t border-line-soft pt-3">
          <summary className="cursor-pointer text-link">Send a test order</summary>
          <form action={sendTestOrder} className="mt-3 space-y-2">
            <input type="hidden" name="business_id" value={businessId} />
            <p className="hint">Goes through the same steps as a real order from the billing app or website.</p>
            <div className="flex flex-wrap gap-2">
              <input name="name" placeholder="Customer name" className="input flex-[1_1_140px]" />
              <input name="phone" required inputMode="tel" placeholder="WhatsApp number" className="input flex-[1_1_140px]" />
            </div>
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <select name="source" className="input w-auto py-1">
                <option value="billing">From billing app</option>
                <option value="website">From website checkout</option>
              </select>
              <label className="flex items-center gap-2">
                <input type="checkbox" name="consent" defaultChecked className="h-4 w-4 accent-ink" />
                Customer agreed to WhatsApp messages
              </label>
            </div>
            <PendingButton label="Send test order" pendingLabel="Sending…" className="btn-ghost" />
          </form>
        </details>
      </div>
    </Section>
  );
}
