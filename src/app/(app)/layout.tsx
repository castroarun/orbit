import Link from "next/link";
import { signOut } from "../actions";

const nav = [
  { href: "/", label: "Send test" },
  { href: "/templates", label: "Templates" },
  { href: "/messages", label: "Messages" },
];

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-5xl items-center gap-8 px-6 py-4">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-widest text-gold">AS Groups · Digital Marketing</div>
            <div className="text-lg font-semibold text-navy">Orbit</div>
          </div>
          <nav className="flex gap-1 text-sm">
            {nav.map((n) => (
              <Link key={n.href} href={n.href} className="rounded-full px-4 py-1.5 text-muted hover:bg-navy-soft hover:text-navy">
                {n.label}
              </Link>
            ))}
          </nav>
          <form action={signOut} className="ml-auto">
            <button className="text-sm text-muted hover:text-navy">Sign out</button>
          </form>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
