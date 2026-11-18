/** Small presentational pieces shared by the stage-2 screens (no data access here). */
import Link from "next/link";
import type { Tone } from "@/lib/customer-stage";

export function PageHeader({ crumb, title, actions }: { crumb?: React.ReactNode; title: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        {crumb ? <div className="crumb">{crumb}</div> : null}
        <h1 className="h1 mt-0.5">{title}</h1>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Pill({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}

export function Section({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2.5 flex items-baseline justify-between gap-3">
        <h2 className="h2">{title}</h2>
        {aside ? <div className="text-[13px]">{aside}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function Empty({ title, children, action }: { title: string; children?: React.ReactNode; action?: { href: string; label: string } }) {
  return (
    <div className="card flex flex-col items-start gap-2 p-6">
      <div className="font-medium">{title}</div>
      {children ? <div className="hint max-w-xl">{children}</div> : null}
      {action ? (
        <Link href={action.href} className="btn mt-2">
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}

/** Date and time in India, e.g. "18 Nov, 13:05" or "18 Nov 2025" for other years. */
export function when(iso: string | null | undefined, withTime = true) {
  if (!iso) return "";
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
    ...(withTime ? { hour: "2-digit", minute: "2-digit", hour12: false } : {}),
  });
}
