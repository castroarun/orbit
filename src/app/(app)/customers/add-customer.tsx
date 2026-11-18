"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import { addCustomer } from "../../actions-crm";
import { CONSENT_SOURCES } from "@/lib/consent";

/** Add one customer by hand. Consent is a separate, unticked box: we never assume it. */
export function AddCustomer({ businessId, defaultLanguage, closeHref, today }: { businessId: string; defaultLanguage: string; closeHref: string; today: string }) {
  const [state, action] = useActionState(addCustomer, undefined);
  const [pending, startTransition] = useTransition();
  const [consent, setConsent] = useState(false);
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => action(data));
  };

  return (
    <form onSubmit={onSubmit} className="card mb-5 space-y-4" aria-label="Add a customer">
      <input type="hidden" name="business_id" value={businessId} />
      <div className="flex items-baseline justify-between">
        <h2 className="h2">Add a customer</h2>
        <Link href={closeHref} className="hint no-underline hover:underline">
          Close
        </Link>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label>
          <span className="label">Name</span>
          <input name="name" className="input" placeholder="Priya Raghavan" />
        </label>
        <label>
          <span className="label">WhatsApp number</span>
          <input name="phone" required inputMode="tel" className="input" placeholder="98404 12314" />
        </label>
        <label>
          <span className="label">Language</span>
          <select name="language" defaultValue={defaultLanguage} className="input">
            <option value="ta">Tamil</option>
            <option value="en">English</option>
          </select>
        </label>
        <label>
          <span className="label">Visit date (optional)</span>
          <input name="visit_date" type="date" max={today} className="input" />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="consent" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="h-4 w-4 accent-ink" />
          They agreed to get WhatsApp messages from the business
        </label>
        {consent ? (
          <label className="flex items-center gap-2 text-sm">
            <span className="hint">How:</span>
            <select name="consent_source" defaultValue="billing" className="input w-auto py-1">
              {Object.entries(CONSENT_SOURCES)
                .filter(([k]) => k !== "import")
                .map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
            </select>
          </label>
        ) : (
          <span className="hint">Without consent the customer is saved but never messaged.</span>
        )}
      </div>
      {state?.error ? (
        <div role="alert" className="rounded-lg border border-[#f2d0d0] bg-[#fbeeee] px-4 py-3 text-sm text-[#9f1d1d]">
          {state.error}
        </div>
      ) : null}
      <button className="btn" disabled={pending} aria-busy={pending}>
        {pending ? "Adding…" : "Add customer"}
      </button>
    </form>
  );
}
