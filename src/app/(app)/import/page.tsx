import { listBusinesses, loadAgency } from "@/lib/page-data";
import { BusinessPicker } from "../business-picker";
import { param } from "../notice";
import { Empty, PageHeader } from "../ui";
import { ImportFlow } from "./import-flow";

export default async function ImportPage({ searchParams }: PageProps<"/import">) {
  const sp = await searchParams;
  const { supabase } = await loadAgency();
  const businesses = await listBusinesses(supabase);
  if (!businesses.length)
    return (
      <div>
        <PageHeader title="Import customers" />
        <Empty title="Add a business first" action={{ href: "/businesses/new", label: "Add business" }}>
          Imported customers always belong to one business.
        </Empty>
      </div>
    );
  const business = businesses.find((b) => b.id === param(sp.b)) ?? businesses[0];

  return (
    <div>
      <PageHeader
        crumb={business.name}
        title="Import customers"
        actions={<BusinessPicker businesses={businesses} current={business.id} basePath="/import" />}
      />
      <ImportFlow key={business.id} businessId={business.id} businessName={business.name} />
    </div>
  );
}
