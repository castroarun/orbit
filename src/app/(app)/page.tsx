import { loadSandbox } from "@/lib/page-data";
import { Notice, param } from "./notice";
import { SendForm, type TemplateOption } from "./send-form";

export default async function SendTestPage({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const { business, supabase } = await loadSandbox();
  const { data: templates } = await supabase
    .from("templates")
    .select("name, language, category, status, body, components")
    .eq("business_id", business.id)
    .eq("status", "APPROVED")
    .order("name");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-navy">Send a test message</h1>
        <p className="mt-1 text-sm text-muted">
          From Meta&apos;s test number ({business.wa_phone_number_id ? `phone number ID ${business.wa_phone_number_id}` : "not set up yet"}).
          It only delivers to phones you have added as recipients in Meta&apos;s App Dashboard. Only approved templates are listed.
        </p>
      </div>

      <Notice ok={param(sp.ok)} error={param(sp.error)} link={param(sp.link)} />

      <SendForm templates={(templates ?? []) as TemplateOption[]} />
    </div>
  );
}
