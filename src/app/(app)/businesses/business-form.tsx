"use client";

import { useActionState, useTransition } from "react";
import Link from "next/link";
import { saveBusiness } from "../../actions-crm";
import { BUSINESS_STATUSES } from "@/lib/business";
import { formatPhone } from "@/lib/phone";
import type { BusinessRow } from "@/lib/page-data";

function Field({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint ? <span className="hint mt-1 block">{hint}</span> : null}
    </label>
  );
}

/** Add or edit a client business. Errors appear above the button and nothing typed is lost. */
export function BusinessForm({ business }: { business?: BusinessRow }) {
  const [state, action] = useActionState(saveBusiness, undefined);
  const [pending, startTransition] = useTransition();
  // Submit by hand so React doesn't clear the form when the server sends back an error.
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => action(data));
  };
  const b = business;
  const langs = b?.languages ?? ["ta", "en"];

  return (
    <form onSubmit={onSubmit} className="card max-w-3xl space-y-6">
      {b ? <input type="hidden" name="id" value={b.id} /> : null}

      <fieldset className="space-y-4">
        <legend className="h2 mb-3">The business</legend>
        <Field label="Business name" hint="As customers know it. Shown in messages.">
          <input name="name" required defaultValue={b?.name} className="input" placeholder="Ananya Dental Care" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Area">
            <input name="area" defaultValue={b?.area ?? ""} className="input" placeholder="Velachery" />
          </Field>
          <Field label="Type of business">
            <input name="kind" defaultValue={b?.kind ?? ""} className="input" placeholder="Dental clinic" />
          </Field>
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="h2 mb-3">The owner</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Owner's first name" hint="Messages are signed with it: “this is Ravi from…”">
            <input name="owner_first_name" defaultValue={b?.owner_first_name ?? ""} className="input" placeholder="Ravi" />
          </Field>
          <Field label="Owner's WhatsApp number" hint="Complaint alerts go here.">
            <input
              name="owner_phone"
              inputMode="tel"
              defaultValue={b?.owner_phone ? formatPhone(b.owner_phone) : ""}
              className="input"
              placeholder="98400 12345"
            />
          </Field>
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="h2 mb-3">Google</legend>
        <Field
          label="Google review link"
          hint="In the owner's Google Business Profile: Ask for reviews → copy link (looks like g.page/r/…/review)."
        >
          <input name="google_review_url" type="url" defaultValue={b?.google_review_url ?? ""} className="input" placeholder="https://g.page/r/…/review" />
        </Field>
        <Field
          label="Google Place ID"
          hint={
            <>
              Needed for daily rating and review-count tracking. Find it with Google&apos;s{" "}
              <a className="link" href="https://developers.google.com/maps/documentation/places/web-service/place-id" target="_blank" rel="noreferrer">
                Place ID finder
              </a>
              . Starts with ChIJ…
            </>
          }
        >
          <input name="google_place_id" defaultValue={b?.google_place_id ?? ""} className="input font-mono text-[13px]" placeholder="ChIJ…" />
        </Field>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="h2 mb-3">Messages and plan</legend>
        <div>
          <span className="label">Message languages</span>
          <div className="flex gap-5 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" name="languages" value="ta" defaultChecked={langs.includes("ta")} className="h-4 w-4 accent-ink" />
              Tamil
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="languages" value="en" defaultChecked={langs.includes("en")} className="h-4 w-4 accent-ink" />
              English
            </label>
          </div>
          <span className="hint mt-1 block">The first one ticked is used when a customer&apos;s language isn&apos;t known.</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Status">
            <select name="status" defaultValue={b?.status ?? "pilot"} className="input">
              {Object.entries(BUSINESS_STATUSES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Plan">
            <input name="plan" defaultValue={b?.plan ?? ""} className="input" placeholder="[YOUR PRICE] / month" />
          </Field>
        </div>
        <Field label="Notes (only we see these)">
          <textarea name="notes" defaultValue={b?.notes ?? ""} rows={3} className="input" />
        </Field>
        <p className="hint">
          Sending starts as one-tap (staff press send in WhatsApp). It switches to automatic once the business connects its
          WhatsApp number through Meta.
        </p>
      </fieldset>

      {state?.error ? (
        <div role="alert" className="rounded-lg border border-[#f2d0d0] bg-[#fbeeee] px-4 py-3 text-sm text-[#9f1d1d]">
          {state.error}
        </div>
      ) : null}

      <div className="flex gap-2">
        <button className="btn" disabled={pending} aria-busy={pending}>
          {pending ? "Saving…" : b ? "Save changes" : "Add business"}
        </button>
        <Link href={b ? `/businesses/${b.id}` : "/businesses"} className="btn-ghost">
          Cancel
        </Link>
      </div>
    </form>
  );
}
