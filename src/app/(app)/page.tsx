import { loadSandbox } from "@/lib/page-data";
import { sendTest } from "../actions";
import { Notice, param } from "./notice";

export default async function SendTestPage({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const { business, supabase } = await loadSandbox();
  const { data: templates } = await supabase
    .from("templates")
    .select("name, language, status, body")
    .eq("business_id", business.id)
    .order("name");
  const approved = (templates ?? []).filter((t) => t.status === "APPROVED");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-navy">Send a test message</h1>
        <p className="mt-1 text-sm text-muted">
          From Meta&apos;s test number ({business.wa_phone_number_id ? `phone number ID ${business.wa_phone_number_id}` : "not set up yet"}).
          The test number only delivers to phones you have added as recipients in Meta&apos;s App Dashboard.
        </p>
      </div>

      <Notice ok={param(sp.ok)} error={param(sp.error)} link={param(sp.link)} />

      <form action={sendTest} className="card grid gap-5 md:grid-cols-2">
        <div>
          <label className="label" htmlFor="to">To (WhatsApp number)</label>
          <input className="input" id="to" name="to" placeholder="98400 12345" required />
          <p className="hint mt-1">Indian numbers get +91 automatically.</p>
        </div>

        <div>
          <label className="label" htmlFor="mode">Send through</label>
          <select className="input" id="mode" name="mode" defaultValue="meta">
            <option value="meta">Meta Cloud API (automatic)</option>
            <option value="wame">One-tap wa.me link (pilot)</option>
          </select>
        </div>

        <div>
          <label className="label" htmlFor="kind">Message type</label>
          <select className="input" id="kind" name="kind" defaultValue="template">
            <option value="template">Template (can start a conversation)</option>
            <option value="text">Free text (only within 24 h of their last message)</option>
          </select>
        </div>

        <div>
          <label className="label" htmlFor="template">Template</label>
          <select className="input" id="template" name="template" defaultValue="hello_world|en_US">
            <option value="hello_world|en_US">hello_world (Meta&apos;s sample, en_US)</option>
            {approved.map((t) => (
              <option key={`${t.name}|${t.language}`} value={`${t.name}|${t.language}`}>
                {t.name} ({t.language})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label" htmlFor="params">Template values</label>
          <input className="input" id="params" name="params" placeholder="Priya | Ravi" />
          <p className="hint mt-1">Fills {"{{1}}"}, {"{{2}}"}… in order, separated by |</p>
        </div>

        <div>
          <label className="label" htmlFor="text">Free text</label>
          <input className="input" id="text" name="text" placeholder="Hello from Orbit" />
        </div>

        <div className="md:col-span-2">
          <button className="btn">Send</button>
        </div>
      </form>
    </div>
  );
}
