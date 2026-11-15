"use client";

import { useEffect, useMemo, useState } from "react";
import { templateView } from "@/lib/meta/template-view";
import type { TemplateComponent } from "@/lib/meta/templates";
import { createTemplateAction } from "../../actions";
import { PendingButton } from "../pending-button";
import { WhatsAppBubble } from "../whatsapp-bubble";

const blanksIn = (text: string) => {
  const nums = [...text.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
  return nums.length ? Math.max(...nums) : 0;
};

export function TemplateForm() {
  const [headerType, setHeaderType] = useState<"NONE" | "TEXT" | "IMAGE">("NONE");
  const [headerText, setHeaderText] = useState("");
  const [imageUrl, setImageUrl] = useState<string>();
  const [body, setBody] = useState("Hi {{1}}, this is {{2}}. Thank you for visiting us today. Is everything good after your visit?");
  const [examples, setExamples] = useState<string[]>(["Priya", "Ravi"]);
  const [footer, setFooter] = useState("");

  // Free the local preview of a picked picture when it changes.
  useEffect(() => () => (imageUrl ? URL.revokeObjectURL(imageUrl) : undefined), [imageUrl]);

  const blanks = blanksIn(body);
  const exampleValues = Array.from({ length: blanks }, (_, i) => examples[i] ?? "");

  const view = useMemo(() => {
    const comps: TemplateComponent[] = [];
    if (headerType === "TEXT") comps.push({ type: "HEADER", format: "TEXT", text: headerText });
    if (headerType === "IMAGE") comps.push({ type: "HEADER", format: "IMAGE" });
    comps.push({ type: "BODY", text: body });
    if (footer) comps.push({ type: "FOOTER", text: footer });
    return templateView(comps);
  }, [headerType, headerText, body, footer]);

  return (
    <form action={createTemplateAction} className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="card grid content-start gap-5 md:grid-cols-3">
        <div className="md:col-span-3">
          <h2 className="text-lg font-semibold text-navy">Create a new template</h2>
          <p className="hint mt-1">Write the message once; Meta reviews it (usually within minutes) and it then appears below and on Send test.</p>
        </div>

        <div>
          <label className="label" htmlFor="name">Name</label>
          <input className="input" id="name" name="name" placeholder="visit_checkin" required />
          <p className="hint mt-1">Only you see this. Lowercase, use _ for spaces.</p>
        </div>
        <div>
          <label className="label" htmlFor="language">Language</label>
          <select className="input" id="language" name="language" defaultValue="en">
            <option value="en">English (en)</option>
            <option value="ta">Tamil (ta)</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="category">Category</label>
          <select className="input" id="category" name="category" defaultValue="UTILITY">
            <option value="UTILITY">Utility (about a visit or order)</option>
            <option value="MARKETING">Marketing (offers, greetings)</option>
          </select>
        </div>

        <div>
          <label className="label" htmlFor="header_type">Heading</label>
          <select
            className="input"
            id="header_type"
            name="header_type"
            value={headerType}
            onChange={(e) => setHeaderType(e.target.value as "NONE" | "TEXT" | "IMAGE")}
          >
            <option value="NONE">None</option>
            <option value="TEXT">Bold text</option>
            <option value="IMAGE">Picture</option>
          </select>
        </div>
        <div className="md:col-span-2">
          {headerType === "TEXT" ? (
            <>
              <label className="label" htmlFor="header_text">Heading text</label>
              <input className="input" id="header_text" name="header_text" maxLength={60} value={headerText} onChange={(e) => setHeaderText(e.target.value)} placeholder="Thank you for visiting!" />
            </>
          ) : headerType === "IMAGE" ? (
            <>
              <label className="label" htmlFor="header_image">Sample picture</label>
              <input
                className="input file:mr-3 file:rounded-full file:border-0 file:bg-navy-soft file:px-3 file:py-1 file:text-navy"
                id="header_image"
                name="header_image"
                type="file"
                accept="image/jpeg,image/png"
                required
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  setImageUrl(f ? URL.createObjectURL(f) : undefined);
                }}
              />
              <p className="hint mt-1">JPG or PNG, under 4 MB. Meta reviews with this picture; you can send a different one each time.</p>
            </>
          ) : (
            <p className="hint pt-7">Optional: a bold line or a picture above the message.</p>
          )}
        </div>

        <div className="md:col-span-3">
          <label className="label" htmlFor="body">Message text</label>
          <textarea className="input min-h-28" id="body" name="body" required value={body} onChange={(e) => setBody(e.target.value)} />
          <p className="hint mt-1">Use {"{{1}}"}, {"{{2}}"}… where the value changes per customer. Don&apos;t start or end with one.</p>
        </div>

        {blanks > 0 ? (
          <div className="md:col-span-3">
            <div className="label">Example for each blank</div>
            <p className="hint mb-3">Only Meta&apos;s reviewer sees these, to understand the message.</p>
            <div className="grid gap-3 md:grid-cols-3">
              {exampleValues.map((v, i) => (
                <div key={i}>
                  <label className="mb-1 block text-xs font-medium text-muted" htmlFor={`example_${i + 1}`}>{`{{${i + 1}}}`}</label>
                  <input
                    className="input"
                    id={`example_${i + 1}`}
                    name={`example_${i + 1}`}
                    value={v}
                    required
                    onChange={(e) => setExamples((old) => Object.assign([...old], { [i]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="md:col-span-2">
          <label className="label" htmlFor="footer">Footer (optional)</label>
          <input className="input" id="footer" name="footer" maxLength={60} value={footer} onChange={(e) => setFooter(e.target.value)} placeholder="Reply STOP to stop messages" />
        </div>
        <div className="flex items-end">
          <PendingButton className="btn w-full" label="Submit to Meta" pendingLabel="Submitting…" />
        </div>
      </div>

      <WhatsAppBubble view={view} values={exampleValues} imageUrl={imageUrl} title="Preview (with your examples)" />
    </form>
  );
}
