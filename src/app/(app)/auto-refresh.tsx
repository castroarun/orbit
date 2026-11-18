"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Keeps a screen current while review messages are going out: re-fetches the
 * page every few seconds, only while `active` and only while the tab is visible.
 * Nothing typed in forms is lost (router.refresh keeps client state).
 */
export function AutoRefresh({ active, everyMs = 15000 }: { active: boolean; everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const tick = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const id = window.setInterval(tick, everyMs);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [active, everyMs, router]);
  return active ? (
    <span className="hint inline-flex items-center gap-1.5" aria-live="polite">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent motion-reduce:animate-none" aria-hidden />
      Updating live
    </span>
  ) : null;
}
