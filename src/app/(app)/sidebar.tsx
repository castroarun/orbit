"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isActive, NAV_MAIN, NAV_TOOLS, type NavIcon, type NavItem } from "@/lib/nav";

/** Outline icons (stroke = currentColor), drawn to match the mockup. */
const ICONS: Record<NavIcon, React.ReactNode> = {
  overview: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </>
  ),
  businesses: (
    <>
      <path d="M4.5 10.5V20h15v-9.5" />
      <path d="M3 4h18l-1.6 6.5H4.6z" />
      <path d="M10 20v-5h4v5" />
    </>
  ),
  customers: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5" />
      <path d="M16 4.5a3.5 3.5 0 0 1 0 7" />
      <path d="M18.5 14.8c1.6.8 2.6 2.6 3 5.2" />
    </>
  ),
  import: (
    <>
      <path d="M12 4v11" />
      <path d="M7.5 10.5L12 15l4.5-4.5" />
      <path d="M4 19.5h16" />
    </>
  ),
  send: <path d="M4 12l16-7-6 16-3-6.5z" />,
  templates: (
    <>
      <path d="M6 3h9l4 4v14H6z" />
      <path d="M9 13h6M9 17h6M9 9h3" />
    </>
  ),
  messages: <path d="M4 5h16v11H9l-5 4z" />,
};

export function Icon({ name, className = "h-4 w-4" }: { name: NavIcon; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={`${className} flex-none fill-none stroke-current`}
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {ICONS[name]}
    </svg>
  );
}

function NavLinks({ items, counts }: { items: NavItem[]; counts: Record<string, number> }) {
  const pathname = usePathname();
  return (
    <>
      {items.map((n) => {
        const on = isActive(n.href, pathname);
        return (
          <Link
            key={n.href}
            href={n.href}
            aria-current={on ? "page" : undefined}
            className={`flex flex-none items-center gap-2.5 rounded-[7px] px-2.5 py-[7px] text-[13.5px] whitespace-nowrap no-underline ${
              on ? "bg-selected font-medium text-ink" : "text-ink-2 hover:bg-hover hover:text-ink"
            }`}
          >
            <Icon name={n.icon} />
            {n.label}
            {n.count && counts[n.count] !== undefined ? <span className="ml-auto text-xs text-muted">{counts[n.count]}</span> : null}
          </Link>
        );
      })}
    </>
  );
}

export function Sidebar({ counts, signOut }: { counts: Record<string, number>; signOut: () => Promise<void> }) {
  // Desktop: a fixed column. Phone: brand + sign out on one line, then the menu as one swipeable strip.
  return (
    <aside className="flex w-full flex-col gap-3 border-b border-line bg-side px-3 pt-3 pb-2 md:sticky md:top-0 md:h-screen md:w-[232px] md:flex-none md:gap-[18px] md:border-r md:border-b-0 md:py-[18px]">
      <div className="flex items-center gap-2.5 px-2 text-[15px] font-semibold tracking-[-0.01em]">
        <span className="relative inline-block h-5 w-5 flex-none rounded-md bg-ink" aria-hidden="true">
          <span className="absolute top-[5px] left-[5px] h-[5px] w-1.5 rounded-b-md border-2 border-t-0 border-white" />
        </span>
        Orbit
        <form action={signOut} className="ml-auto md:hidden">
          <button className="cursor-pointer text-[13px] font-normal text-muted hover:text-ink">Sign out</button>
        </form>
      </div>
      <div className="hidden flex-col rounded-lg border border-line bg-white px-2.5 py-2 text-[13px] md:flex">
        <span className="text-[11.5px] text-muted">Agency</span>
        <span>AS Groups · Digital Marketing</span>
      </div>
      <div className="-mx-3 flex gap-0.5 overflow-x-auto px-3 pb-1 md:mx-0 md:flex-col md:gap-[18px] md:overflow-visible md:px-0 md:pb-0">
        <nav aria-label="Main" className="flex flex-none gap-0.5 md:flex-col">
          <NavLinks items={NAV_MAIN} counts={counts} />
        </nav>
        <nav aria-label="Meta test tools" className="flex flex-none gap-0.5 border-l border-line pl-1 md:flex-col md:border-l-0 md:pl-0">
          <div className="hidden px-2.5 pb-1 text-[11.5px] font-medium tracking-wide text-muted uppercase md:block">Meta test tools</div>
          <NavLinks items={NAV_TOOLS} counts={counts} />
        </nav>
      </div>
      <form action={signOut} className="mt-auto hidden px-2.5 md:block">
        <button className="cursor-pointer text-[13px] text-muted hover:text-ink">Sign out</button>
      </form>
    </aside>
  );
}
