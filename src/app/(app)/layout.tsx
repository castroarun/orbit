import { signOut } from "../actions";
import { supabaseForUser } from "@/lib/supabase/server";
import { Sidebar } from "./sidebar";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const supabase = await supabaseForUser();
  const { count } = await supabase.from("businesses").select("id", { count: "exact", head: true }).eq("is_sandbox", false);

  return (
    <div className="flex flex-1 flex-col md:flex-row">
      <Sidebar counts={{ businesses: count ?? 0 }} signOut={signOut} />
      <main className="min-w-0 flex-1 px-4 pt-5 pb-14 md:px-10 md:pt-6">{children}</main>
    </div>
  );
}
