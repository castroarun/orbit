import { syncIfPending } from "@/lib/template-sync";
import Link from "next/link";
import { loadSandbox } from "@/lib/page-data";
import { Notice, param } from "../notice";
import { SendForm, type TemplateOption } from "./send-form";

export default async function SendTestPage({ searchParams }: PageProps<"/send">) {
  const sp = await searchParams;
  const { business, supabase } = await loadSandbox();
  const syncProblem = await syncIfPending(business);
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
          It only delivers to phones you have added as recipients in Meta&apos;s App Dashboard. Only approved templates are listed.{" "}
          <Link href="/templates" className="font-medium text-navy underline">
            Create a template
          </Link>
        </p>
      </div>

      {syncProblem ? (
        <div className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-900">
          Couldn&apos;t check template status with Meta, so statuses below may be out of date. {syncProblem}
        </div>
      ) : null}

      <Notice ok={param(sp.ok)} error={param(sp.error)} link={param(sp.link)} />

      <SendForm templates={(templates ?? []) as TemplateOption[]} />
    </div>
  );
}
