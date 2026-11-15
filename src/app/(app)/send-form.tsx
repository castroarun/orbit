"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import type { TemplateComponent } from "@/lib/meta/templates";
import { fillBlanks, templateView } from "@/lib/meta/template-view";
import { sendTest } from "../actions";

export type TemplateOption = {
  name: string;
  language: string;
  category: string;
  body: string;
  components: TemplateComponent[] | null;
};

const HELLO_WORLD: TemplateOption = {
  name: "hello_world",
  language: "en_US",
  category: "UTILITY",
  body: "Welcome and congratulations!! This message demonstrates your ability to send a WhatsApp message notification from the Cloud API, hosted by Meta. Thank you for taking the time to test with us.",
  components: [
    { type: "HEADER", format: "TEXT", text: "Hello World" },
    { type: "BODY", text: "Welcome and congratulations!! This message demonstrates your ability to send a WhatsApp message notification from the Cloud API, hosted by Meta. Thank you for taking the time to test with us." },
    { type: "FOOTER", text: "WhatsApp Business Platform sample message" },
  ],
};

export function SendForm({ templates }: { templates: TemplateOption[] }) {
  const options = templates.some((t) => t.name === "hello_world") ? templates : [HELLO_WORLD, ...templates];
  const [kind, setKind] = useState<"template" | "text">("template");
  const [key, setKey] = useState(`${options[0].name}|${options[0].language}`);
  const [values, setValues] = useState<string[]>([]);
  const [text, setText] = useState("");

  const selected = options.find((t) => `${t.name}|${t.language}` === key) ?? options[0];
  const view = useMemo(() => templateView(selected.components, selected.body), [selected]);

  const pick = (k: string) => {
    setKey(k);
    setValues([]);
  };
  const setValue = (i: number, v: string) => setValues((old) => Object.assign([...old], { [i]: v }));
  const filled = Array.from({ length: view.blanks }, (_, i) => values[i] ?? "");
  const canSend = kind === "text" ? true : view.sendable && filled.every((v) => v.trim());

  return (
    <form action={sendTest} className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="card grid content-start gap-5 md:grid-cols-2">
        <div>
          <label className="label" htmlFor="to">To (WhatsApp number)</label>
          <input className="input" id="to" name="to" placeholder="98400 12345" required />
          <p className="hint mt-1">Indian numbers get +91 automatically.</p>
        </div>

        <div>
          <label className="label" htmlFor="mode">Send through</label>
          <select className="input" id="mode" name="mode" defaultValue="meta">
            <option value="meta">Meta Cloud API (automatic)</option>
            <option value="wame">One-tap wa.me link (pilot)</option>
          </select>
        </div>

        <div>
          <label className="label" htmlFor="kind">Message type</label>
          <select className="input" id="kind" name="kind" value={kind} onChange={(e) => setKind(e.target.value as "template" | "text")}>
            <option value="template">Template (can start a conversation)</option>
            <option value="text">Free text (only within 24 h of their last message)</option>
          </select>
        </div>

        {kind === "template" ? (
          <>
            <div>
              <label className="label" htmlFor="template">Template</label>
              <select className="input" id="template" name="template" value={key} onChange={(e) => pick(e.target.value)}>
                {options.map((t) => (
                  <option key={`${t.name}|${t.language}`} value={`${t.name}|${t.language}`}>
                    {t.name} ({t.language})
                  </option>
                ))}
              </select>
              <p className="hint mt-1">{selected.category === "MARKETING" ? "Marketing message" : "Utility message"}</p>
            </div>

            {view.blanks > 0 ? (
              <div className="md:col-span-2">
                <div className="label">Fill in the blanks</div>
                <p className="hint mb-3">These change on every send; the rest of the wording is fixed by Meta&apos;s approval.</p>
                <div className="grid gap-3 md:grid-cols-3">
                  {filled.map((v, i) => (
                    <div key={i}>
                      <label className="mb-1 block text-xs font-medium text-muted" htmlFor={`param_${i + 1}`}>
                        {`{{${i + 1}}}`}
                      </label>
                      <input
                        className="input"
                        id={`param_${i + 1}`}
                        name={`param_${i + 1}`}
                        value={v}
                        onChange={(e) => setValue(i, e.target.value)}
                        required
                      />
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="hint md:col-span-2">This template has no blanks to fill: it is sent exactly as shown.</p>
            )}

            {!view.sendable ? (
              <p className="rounded-lg bg-gold-soft px-3 py-2 text-sm text-navy md:col-span-2">{view.reason}</p>
            ) : null}
          </>
        ) : (
          <div className="md:col-span-2">
            <label className="label" htmlFor="text">Message</label>
            <textarea className="input min-h-24" id="text" name="text" value={text} onChange={(e) => setText(e.target.value)} placeholder="Hello from Orbit" />
            <p className="hint mt-1">Only delivers if this person messaged the number in the last 24 hours.</p>
          </div>
        )}

        <div className="md:col-span-2">
          <SendButton disabled={!canSend} />
        </div>
      </div>

      <Preview kind={kind} view={view} values={filled} text={text} />
    </form>
  );
}

/** Shows "Sending…" with a spinner while the message is on its way to Meta. */
function SendButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn gap-2" disabled={disabled || pending} aria-busy={pending}>
      {pending ? (
        <>
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden />
          Sending…
        </>
      ) : (
        "Send"
      )}
    </button>
  );
}

function Preview({
  kind,
  view,
  values,
  text,
}: {
  kind: "template" | "text";
  view: ReturnType<typeof templateView>;
  values: string[];
  text: string;
}) {
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium text-ink">What the customer will see</div>
      <div className="rounded-2xl p-4" style={{ background: "#efeae2" }}>
        <div className="max-w-[300px] overflow-hidden rounded-lg bg-white text-[14px] leading-5 text-[#111b21] shadow-sm">
          {kind === "text" ? (
            <p className="whitespace-pre-wrap px-3 py-2">{text || <span className="text-muted">Type a message…</span>}</p>
          ) : (
            <>
              {view.header?.kind === "media" ? (
                <div className="m-1 flex h-32 items-center justify-center rounded bg-[#d1d7db] text-xs uppercase tracking-wide text-[#54656f]">
                  {view.header.format}
                </div>
              ) : null}
              <div className="px-3 pt-2 pb-1">
                {view.header?.kind === "text" ? <p className="mb-1 font-semibold">{view.header.text}</p> : null}
                <p className="whitespace-pre-wrap">
                  {fillBlanks(view.body, values)
                    .split(/(\{\{\d+\}\})/g)
                    .map((part, i) =>
                      /^\{\{\d+\}\}$/.test(part) ? (
                        <span key={i} className="rounded bg-gold-soft px-1 text-navy">
                          {part}
                        </span>
                      ) : (
                        part
                      ),
                    )}
                </p>
                {view.footer ? <p className="mt-1 text-xs text-[#667781]">{view.footer}</p> : null}
                <p className="mt-1 text-right text-[11px] text-[#667781]">now</p>
              </div>
              {view.buttons.map((b, i) => (
                <div key={i} className="border-t border-[#e9edef] py-2 text-center text-sm font-medium text-[#027eb5]">
                  {b.type === "URL" ? "↗ " : b.type === "PHONE_NUMBER" ? "☎ " : "↩ "}
                  {b.text}
                </div>
              ))}
            </>
          )}
        </div>
      </div>
      <p className="hint">Preview only. WhatsApp&apos;s exact styling differs a little by phone.</p>
    </div>
  );
}
