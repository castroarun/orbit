import { formatPhone } from "@/lib/phone";
import { loadSandbox } from "@/lib/page-data";

const statusStyle: Record<string, string> = {
  received: "bg-navy-soft text-navy",
  sent: "bg-gold-soft text-navy",
  delivered: "bg-green-50 text-green-800",
  read: "bg-green-100 text-green-900",
  failed: "bg-red-50 text-red-700",
  link: "bg-gold-soft text-navy",
};

export default async function MessagesPage() {
  const { business, supabase } = await loadSandbox();
  const { data: messages } = await supabase
    .from("messages")
    .select("id, direction, kind, template_name, phone, body, mode, status, price_category, error, created_at")
    .eq("business_id", business.id)
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-navy">Messages</h1>
        <p className="mt-1 text-sm text-muted">
          Everything sent and received on the test number.
        </p>
        <p className="mt-3 rounded-lg bg-gold-soft px-3 py-2 text-sm text-navy">
          While the Meta app is unpublished (until business verification), Meta only delivers test webhooks, so customers&apos;
          replies and the delivered/read ticks won&apos;t show here yet. Sends are recorded as &quot;sent&quot;.
        </p>
      </div>

      <div className="card p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-line text-left text-muted">
            <tr>
              <th className="px-6 py-3 font-medium">When</th>
              <th className="px-6 py-3 font-medium">Customer</th>
              <th className="px-6 py-3 font-medium">Message</th>
              <th className="px-6 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {(messages ?? []).map((m) => (
              <tr key={m.id} className="border-b border-line last:border-0 align-top">
                <td className="whitespace-nowrap px-6 py-4 text-muted">
                  {new Date(m.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })}
                </td>
                <td className="whitespace-nowrap px-6 py-4">
                  <span className="mr-2 text-muted">{m.direction === "in" ? "←" : "→"}</span>
                  {formatPhone(m.phone)}
                </td>
                <td className="px-6 py-4">
                  {m.template_name ? <div className="text-xs text-muted">template {m.template_name}</div> : null}
                  <div className="max-w-md">{m.body ?? <span className="text-muted">({m.kind})</span>}</div>
                  {m.error ? <div className="mt-1 text-xs text-red-600">{m.error}</div> : null}
                </td>
                <td className="px-6 py-4">
                  <span className={`rounded-full px-3 py-1 text-xs font-medium ${statusStyle[m.status] ?? "bg-navy-soft"}`}>{m.status}</span>
                  {m.price_category ? <div className="hint mt-1">{m.price_category}</div> : null}
                </td>
              </tr>
            ))}
            {!messages?.length ? (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-muted">No messages yet.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
