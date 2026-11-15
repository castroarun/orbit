import type { TemplateComponent } from "./templates";

/**
 * Turns Meta's template components into what the Send screen needs:
 * a WhatsApp-style preview, how many {{n}} blanks the text has, and whether
 * the simple test sender can send it (body values only, for now).
 */

export type TemplateView = {
  header?: { kind: "text"; text: string } | { kind: "media"; format: string };
  body: string;
  footer?: string;
  buttons: { type: string; text: string; url?: string }[];
  blanks: number;
  sendable: boolean;
  reason?: string;
};

const blanksIn = (text = "") => {
  const nums = [...text.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
  return nums.length ? Math.max(...nums) : 0;
};

export function templateView(components: TemplateComponent[] | null | undefined, fallbackBody = ""): TemplateView {
  const list = components ?? [];
  const byType = (t: string) => list.find((c) => c.type?.toUpperCase() === t);

  const h = byType("HEADER");
  const b = byType("BODY");
  const f = byType("FOOTER");
  const btns = byType("BUTTONS");
  const carousel = byType("CAROUSEL");

  const header =
    h && (h.format ?? "TEXT").toUpperCase() === "TEXT"
      ? { kind: "text" as const, text: h.text ?? "" }
      : h
        ? { kind: "media" as const, format: (h.format ?? "MEDIA").toUpperCase() }
        : undefined;

  const buttons = (btns?.buttons ?? []).map((x) => ({ type: x.type, text: x.text ?? "", url: x.url }));
  const view: TemplateView = {
    header,
    body: b?.text ?? fallbackBody,
    footer: f?.text,
    buttons,
    blanks: blanksIn(b?.text ?? fallbackBody),
    sendable: true,
  };

  // What the simple test sender can't fill in yet.
  if (carousel) return { ...view, sendable: false, reason: "Carousel templates can only be previewed here for now." };
  if (header?.kind === "media")
    return { ...view, sendable: false, reason: `This template needs a ${header.format.toLowerCase()} in its heading; sending it isn't supported on this screen yet.` };
  if (header?.kind === "text" && blanksIn(header.text) > 0)
    return { ...view, sendable: false, reason: "This template has a blank in its heading; sending it isn't supported on this screen yet." };
  if (buttons.some((x) => x.url && /\{\{\d+\}\}/.test(x.url)))
    return { ...view, sendable: false, reason: "This template has a link button that needs a value; sending it isn't supported on this screen yet." };
  return view;
}

/** Fill {{1}}, {{2}}… for the preview; empty blanks stay visible as {{n}}. */
export function fillBlanks(text: string, values: string[]): string {
  return text.replace(/\{\{(\d+)\}\}/g, (_, i) => values[Number(i) - 1]?.trim() || `{{${i}}}`);
}
