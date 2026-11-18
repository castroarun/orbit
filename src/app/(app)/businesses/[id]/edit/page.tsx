import Link from "next/link";
import { notFound } from "next/navigation";
import { BUSINESS_COLUMNS, loadAgency, type BusinessRow } from "@/lib/page-data";
import { BusinessForm } from "../../business-form";
import { PageHeader } from "../../../ui";

export default async function EditBusinessPage({ params }: PageProps<"/businesses/[id]/edit">) {
  const { id } = await params;
  const { supabase } = await loadAgency();
  const { data } = await supabase.from("businesses").select(BUSINESS_COLUMNS).eq("id", id).eq("is_sandbox", false).maybeSingle();
  if (!data) notFound();
  const b = data as BusinessRow;
  return (
    <div>
      <PageHeader
        crumb={
          <>
            <Link href="/businesses" className="text-muted no-underline hover:underline">
              Businesses
            </Link>{" "}
            /{" "}
            <Link href={`/businesses/${b.id}`} className="text-muted no-underline hover:underline">
              {b.name}
            </Link>
          </>
        }
        title="Edit business"
      />
      <BusinessForm business={b} />
    </div>
  );
}
