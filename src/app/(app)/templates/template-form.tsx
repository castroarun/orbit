"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { templateView } from "@/lib/meta/template-view";
import type { TemplateComponent } from "@/lib/meta/templates";
import { STARTERS, type Starter } from "@/lib/template-starters";
import Link from "next/link";
import { createTemplateAction, editTemplateAction } from "../../actions";
import { WhatsAppBubble } from "../whatsapp-bubble";

const blanksIn = (text: string) => {
  const nums = [...text.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
  return nums.length ? Math.max(...nums) : 0;
};

export type EditingTemplate = {
  id: string;
  name: string;
  language: string;
  category: Starter["category"];
  status: string;
  headerType: Starter["headerType"];
  headerText: string;
  imageUrl?: string;
  body: string;
  examples: string[];
  footer: string;
  hasButtons: boolean;
};

export function TemplateForm({ editing }: { editing?: EditingTemplate }) {
  const first = STARTERS[0];
  const init = editing ?? { ...first, headerText: first.headerText ?? "", footer: first.footer ?? "", imageUrl: undefined };
  const [starterId, setStarterId] = useState(first.id);
  const [name, setName] = useState(init.name);
  const [category, setCategory] = useState<Starter["category"]>(init.category);
  const [headerType, setHeaderType] = useState<Starter["headerType"]>(init.headerType);
  const [headerText, setHeaderText] = useState(init.headerText);
  const [imageUrl, setImageUrl] = useState<string | undefined>(init.imageUrl);
  const [pickedNew, setPickedNew] = useState(false);
  const [body, setBody] = useState(init.body);
  const [examples, setExamples] = useState<string[]>(init.examples);
  const [footer, setFooter] = useState(init.footer);
  const categoryLocked = editing?.status === "APPROVED";
  const [language, setLanguage] = useState(editing?.language ?? "en");

  // Submit without React's automatic form reset, so an error never wipes what was typed.
  const [state, runAction] = useActionState(editing ? editTemplateAction : createTemplateAction, {});
  const [pending, startTransition] = useTransition();
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => runAction(data));
  };

  const starter = STARTERS.find((x) => x.id === starterId) ?? first;
  const applyStarter = (id: string) => {
    const x = STARTERS.find((s) => s.id === id) ?? first;
    setStarterId(x.id);
    setName(x.name);
    setCategory(x.category);
    setHeaderType(x.headerType);
    setHeaderText(x.headerText ?? "");
    setImageUrl(undefined);
    setBody(x.body);
    setExamples(x.examples);
    setFooter(x.footer ?? "");
    setKeptNote(false);
  };
  // Structures that fit the chosen category (Blank fits both).
  const fits = (x: Starter) => x.id === "blank" || x.category === category;
  const groups = [...new Set(STARTERS.filter(fits).map((x) => x.group))];
  const [keptNote, setKeptNote] = useState(false);

  /** Changing category loads that category's first structure, unless the text was already edited. */
  const changeCategory = (c: Starter["category"]) => {
    setCategory(c);
    if (editing) return;
    const untouched = body === starter.body || body.trim() === "";
    if (untouched) {
      const next = STARTERS.find((x) => x.category === c && x.id !== "blank");
      if (next) {
        applyStarter(next.id);
        setKeptNote(false);
        return;
      }
    }
    setKeptNote(true);
  };

  // Free the local preview of a picked picture when it changes.
  useEffect(() => () => (imageUrl && pickedNew ? URL.revokeObjectURL(imageUrl) : undefined), [imageUrl, pickedNew]);

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
    <form onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-[1fr_340px]">
      {editing ? <input type="hidden" name="template_row_id" value={editing.id} /> : null}
      <div className={`card grid content-start gap-5 md:grid-cols-3 ${editing ? "border-gold" : ""}`}>
        <div className="md:col-span-3">
          {editing ? (
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-navy">
                  Edit {editing.name} <span className="text-muted">· {editing.language}</span>
                </h2>
                <p className="hint mt-1">
                  Saving sends it back to Meta for review; it can&apos;t be sent until approved again. Name and language can&apos;t change
                  {categoryLocked ? ", and neither can the category of an approved template" : ""}.
                  {editing.status === "APPROVED" ? " Meta allows one edit a day (10 a month) on approved templates." : ""}
                </p>
              </div>
              <Link href="/templates" className="text-sm text-muted hover:text-navy">
                Cancel
              </Link>
            </div>
          ) : (
            <>
              <h2 className="text-lg font-semibold text-navy">Create a new template</h2>
              <p className="hint mt-1">Write the message once; Meta reviews it (usually within minutes) and it then appears below and on Send test.</p>
            </>
          )}
          {state.error ? (
            <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
              {state.error}
            </p>
          ) : null}
          {editing?.hasButtons ? (
            <p className="mt-3 rounded-lg bg-gold-soft px-3 py-2 text-sm text-navy">
              This template has buttons, which Orbit can&apos;t edit yet. Saving here would remove them, so edit it in Meta&apos;s WhatsApp Manager instead.
            </p>
          ) : null}
        </div>

        {editing ? null : (
        <div className="md:col-span-3 grid gap-4 rounded-xl bg-navy-soft/60 p-4 md:grid-cols-2">
          <div>
            <label className="label" htmlFor="category">1. Type of message</label>
            <select className="input bg-white" id="category" name="category" value={category} onChange={(e) => changeCategory(e.target.value as Starter["category"])}>
              <option value="UTILITY">Utility: about a visit or order</option>
              <option value="MARKETING">Marketing: offers and greetings</option>
            </select>
            <p className="hint mt-1">
              {category === "MARKETING"
                ? "≈ ₹0.86 per message. Anything promotional must be Marketing."
                : "≈ ₹0.12 per message. Only for a specific visit or order, nothing promotional."}
            </p>
          </div>
          <div>
            <label className="label" htmlFor="starter">2. Start from</label>
            <select className="input bg-white" id="starter" value={starterId} onChange={(e) => applyStarter(e.target.value)}>
              {groups.map((g) => (
                <optgroup key={g} label={g}>
                  {STARTERS.filter((x) => x.group === g && fits(x)).map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <p className="hint mt-1">{starter.hint} Everything below can be edited.</p>
            {keptNote ? (
              <p className="mt-2 text-xs text-navy">
                Your edited text was kept. Pick a {category === "MARKETING" ? "Marketing" : "Utility"} structure here to replace it.
              </p>
            ) : null}
          </div>
        </div>
        )}

        <div>
          <label className="label" htmlFor="name">Name</label>
          <input className="input disabled:bg-canvas disabled:text-muted" id="name" name="name" placeholder="visit_checkin" required value={name} disabled={!!editing} onChange={(e) => setName(e.target.value)} />
          <p className="hint mt-1">Only you see this. Lowercase, use _ for spaces.</p>
        </div>
        <div>
          <label className="label" htmlFor="language">Language</label>
          <select className="input disabled:bg-canvas disabled:text-muted" id="language" name="language" value={language} onChange={(e) => setLanguage(e.target.value)} disabled={!!editing}>
            {editing && !["en", "ta"].includes(editing.language) ? <option value={editing.language}>{editing.language}</option> : null}
            <option value="en">English (en)</option>
            <option value="ta">Tamil (ta)</option>
          </select>
        </div>

        {editing ? (
          <div>
            <label className="label" htmlFor="category_edit">Type of message</label>
            <select className="input disabled:bg-canvas disabled:text-muted" id="category_edit" name="category" value={category} disabled={categoryLocked} onChange={(e) => setCategory(e.target.value as Starter["category"])}>
              <option value="UTILITY">Utility: about a visit or order</option>
              <option value="MARKETING">Marketing: offers and greetings</option>
            </select>
          </div>
        ) : (
          <div />
        )}

        <div>
          <label className="label" htmlFor="header_type">Heading</label>
          <select
            className="input"
            id="header_type"
            name="header_type"
            value={headerType}
            onChange={(e) => setHeaderType(e.target.value as Starter["headerType"])}
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
                required={!editing?.imageUrl}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  setPickedNew(!!f);
                  setImageUrl(f ? URL.createObjectURL(f) : editing?.imageUrl);
                }}
              />
              <p className="hint mt-1">
                {editing?.imageUrl ? "Leave empty to keep the current picture. " : ""}JPG or PNG, under 4 MB. Meta reviews with this picture; you can send a different one each time.
              </p>
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
          <button className="btn w-full gap-2" disabled={pending} aria-busy={pending}>
            {pending ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden />
                {editing ? "Saving…" : "Submitting…"}
              </>
            ) : editing ? (
              "Save and resubmit"
            ) : (
              "Submit to Meta"
            )}
          </button>
        </div>
      </div>

      <WhatsAppBubble view={view} values={exampleValues} imageUrl={imageUrl} title="Preview (with your examples)" />
    </form>
  );
}
