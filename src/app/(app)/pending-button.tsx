"use client";

import { useFormStatus } from "react-dom";

/** A submit button that shows a spinner and a "…ing" label while its form is being processed. */
export function PendingButton({ label, pendingLabel, className = "btn" }: { label: string; pendingLabel: string; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button className={`${className} gap-2`} disabled={pending} aria-busy={pending}>
      {pending ? (
        <>
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current/30 border-t-current" aria-hidden />
          {pendingLabel}
        </>
      ) : (
        label
      )}
    </button>
  );
}
