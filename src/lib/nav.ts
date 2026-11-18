/**
 * The sidebar menu: the one place to add, rename or reorder screens.
 * Screens from the design that aren't built yet (Sequences, Replies, Google
 * reviews, Reports) are added here when they ship, never as dead links.
 */
export type NavIcon = "overview" | "businesses" | "customers" | "import" | "send" | "templates" | "messages";

export type NavItem = { href: string; label: string; icon: NavIcon; count?: "businesses" };

export const NAV_MAIN: NavItem[] = [
  { href: "/", label: "Overview", icon: "overview" },
  { href: "/businesses", label: "Businesses", icon: "businesses", count: "businesses" },
  { href: "/customers", label: "Customers", icon: "customers" },
  { href: "/import", label: "Import", icon: "import" },
];

/** Meta test-number tools from stage 1 (App Review videos, template approvals). */
export const NAV_TOOLS: NavItem[] = [
  { href: "/send", label: "Send test", icon: "send" },
  { href: "/templates", label: "Templates", icon: "templates" },
  { href: "/messages", label: "Messages", icon: "messages" },
];

/** True when `href` is the current screen or one of its sub-pages. */
export function isActive(href: string, pathname: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}
