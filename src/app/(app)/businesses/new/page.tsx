import Link from "next/link";
import { loadAgency } from "@/lib/page-data";
import { BusinessForm } from "../business-form";
import { PageHeader } from "../../ui";

export default async function NewBusinessPage() {
  await loadAgency();
  return (
    <div>
      <PageHeader
        crumb={
          <Link href="/businesses" className="text-muted no-underline hover:underline">
            Businesses
          </Link>
        }
        title="Add a business"
      />
      <BusinessForm />
    </div>
  );
}
