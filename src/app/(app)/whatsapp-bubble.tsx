"use client";

import { fillBlanks, type TemplateView } from "@/lib/meta/template-view";

/** A WhatsApp-style message bubble used on Send test and the template builder. */
export function WhatsAppBubble({
  view,
  values = [],
  imageUrl,
  plainText,
  title = "What the customer will see",
}: {
  view?: TemplateView;
  values?: string[];
  imageUrl?: string;
  plainText?: string;
  title?: string;
}) {
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium text-ink">{title}</div>
      <div className="rounded-2xl p-4" style={{ background: "#efeae2" }}>
        <div className="max-w-[300px] overflow-hidden rounded-lg bg-white text-[14px] leading-5 text-[#111b21] shadow-sm">
          {!view ? (
            <p className="whitespace-pre-wrap px-3 py-2">{plainText || <span className="text-muted">Type a message…</span>}</p>
          ) : (
            <>
              {view.header?.kind === "media" ? (
                imageUrl ?? view.header.sampleUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imageUrl ?? view.header.sampleUrl} alt="Picture heading" className="m-1 block max-h-60 w-[calc(100%-8px)] rounded object-cover" />
                ) : (
                  <div className="m-1 flex h-32 items-center justify-center rounded bg-[#d1d7db] text-xs uppercase tracking-wide text-[#54656f]">
                    {view.header.format}
                  </div>
                )
              ) : null}
              <div className="px-3 pt-2 pb-1">
                {view.header?.kind === "text" && view.header.text ? <p className="mb-1 font-semibold">{view.header.text}</p> : null}
                <p className="whitespace-pre-wrap">
                  {view.body ? (
                    fillBlanks(view.body, values)
                      .split(/(\{\{\d+\}\})/g)
                      .map((part, i) =>
                        /^\{\{\d+\}\}$/.test(part) ? (
                          <span key={i} className="rounded bg-gold-soft px-1 text-navy">
                            {part}
                          </span>
                        ) : (
                          part
                        ),
                      )
                  ) : (
                    <span className="text-muted">Message text…</span>
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
