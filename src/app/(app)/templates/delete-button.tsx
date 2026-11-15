"use client";

import { useState } from "react";
import { deleteTemplateAction } from "../../actions";
import { PendingButton } from "../pending-button";

/** Two-step delete: first click asks, second click deletes (no browser pop-up). */
export function DeleteTemplateButton({ id, name }: { id: string; name: string }) {
  const [asking, setAsking] = useState(false);
  if (!asking)
    return (
      <button type="button" className="text-sm text-red-700 hover:underline" onClick={() => setAsking(true)}>
        Delete
      </button>
    );
  return (
    <form action={deleteTemplateAction} className="mt-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
      <input type="hidden" name="template_row_id" value={id} />
      <p>
        Delete <strong>{name}</strong> at Meta? This can&apos;t be undone, and the name can&apos;t be reused for 30 days.
      </p>
      <div className="mt-2 flex items-center gap-3">
        <PendingButton className="inline-flex items-center rounded-full bg-red-700 px-3 py-1 text-xs font-medium text-white" label="Yes, delete" pendingLabel="Deleting…" />
        <button type="button" className="text-red-800 hover:underline" onClick={() => setAsking(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
