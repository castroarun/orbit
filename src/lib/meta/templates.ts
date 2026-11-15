import { graphRequest, type FetchLike } from "./graph";

/**
 * WhatsApp message templates (Meta must approve each format once).
 * Body placeholders are {{1}}, {{2}}… and Meta wants one example value for each.
 */

export type TemplateCategory = "UTILITY" | "MARKETING";

export type TemplateHeader =
  | { type: "TEXT"; text: string }
  /** handle: Meta's upload handle for the sample picture; imageUrl: our stored copy (preview + default send). */
  | { type: "IMAGE"; handle: string; imageUrl: string };

export type NewTemplate = {
  name: string;
  language: string;
  category: TemplateCategory;
  body: string;
  examples: string[];
  header?: TemplateHeader;
  footer?: string;
};

export type MetaTemplate = {
  id: string;
  name: string;
  language: string;
  status: string;
  category: string;
  rejected_reason?: string;
  components?: TemplateComponent[];
};

/** A template part as Meta returns it (header, body, footer, buttons, carousel). */
export type TemplateComponent = {
  type: string; // HEADER | BODY | FOOTER | BUTTONS | CAROUSEL
  format?: string; // HEADER: TEXT | IMAGE | VIDEO | DOCUMENT | LOCATION
  text?: string;
  example?: { header_handle?: string[]; body_text?: string[][] };
  /** Orbit's own copy of a picture heading (not sent to Meta). */
  orbit_image_url?: string;
  buttons?: { type: string; text?: string; url?: string; phone_number?: string }[];
};

/** Meta's rule: lowercase letters, digits and underscores only. */
export function toTemplateName(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 512);
}

export function countPlaceholders(body: string): number {
  const nums = [...body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
  return nums.length ? Math.max(...nums) : 0;
}

export function validateTemplate(t: NewTemplate): string[] {
  const errors: string[] = [];
  if (!t.name || t.name !== toTemplateName(t.name)) errors.push("Name: lowercase letters, numbers and _ only");
  if (!t.body.trim()) errors.push("Message text is empty");
  if (t.body.length > 1024) errors.push("Message text is over 1,024 characters");
  const n = countPlaceholders(t.body);
  for (let i = 1; i <= n; i++) {
    if (!t.body.includes(`{{${i}}}`)) errors.push(`Placeholders must be numbered in order: {{${i}}} is missing`);
  }
  if (t.examples.filter((e) => e.trim()).length < n) errors.push(`Give an example value for each of the ${n} placeholders`);
  if (/^\s*\{\{\d+\}\}|\{\{\d+\}\}\s*$/.test(t.body)) errors.push("Meta rejects text that starts or ends with a placeholder");
  if (t.header?.type === "TEXT") {
    if (!t.header.text.trim()) errors.push("Heading is empty");
    if (t.header.text.length > 60) errors.push("Heading is over 60 characters");
    if (/\{\{\d+\}\}/.test(t.header.text)) errors.push("Blanks in the heading aren't supported yet");
  }
  if (t.header?.type === "IMAGE" && !t.header.handle) errors.push("Picture upload to Meta failed");
  if (t.footer && t.footer.length > 60) errors.push("Footer is over 60 characters");
  return errors;
}

/** Fill {{1}}, {{2}}… with values (for previews and wa.me mode). */
export function fillTemplate(body: string, params: string[]): string {
  return body.replace(/\{\{(\d+)\}\}/g, (_, i) => params[Number(i) - 1] ?? `{{${i}}}`);
}

export function buildTemplatePayload(t: NewTemplate) {
  const n = countPlaceholders(t.body);
  const bodyComponent: Record<string, unknown> = { type: "BODY", text: t.body };
  if (n > 0) bodyComponent.example = { body_text: [t.examples.slice(0, n)] };

  const header =
    t.header?.type === "TEXT"
      ? [{ type: "HEADER", format: "TEXT", text: t.header.text }]
      : t.header?.type === "IMAGE"
        ? [{ type: "HEADER", format: "IMAGE", example: { header_handle: [t.header.handle] } }]
        : [];

  return {
    name: t.name,
    language: t.language,
    category: t.category,
    components: [...header, bodyComponent, ...(t.footer ? [{ type: "FOOTER", text: t.footer }] : [])],
  };
}

/** What Orbit stores: Meta's components plus our own copy of the picture for previews and default sends. */
export function componentsToStore(t: NewTemplate): TemplateComponent[] {
  return buildTemplatePayload(t).components.map((c) =>
    c.type === "HEADER" && t.header?.type === "IMAGE" ? { ...c, orbit_image_url: t.header.imageUrl } : c,
  ) as TemplateComponent[];
}

export async function createTemplate(wabaId: string, token: string, t: NewTemplate, fetchImpl?: FetchLike) {
  return graphRequest<{ id: string; status: string; category: string }>(
    `${wabaId}/message_templates`,
    token,
    { method: "POST", body: buildTemplatePayload(t) },
    fetchImpl,
  );
}

export async function listTemplates(wabaId: string, token: string, fetchImpl?: FetchLike) {
  const res = await graphRequest<{ data: MetaTemplate[] }>(
    `${wabaId}/message_templates`,
    token,
    { query: { fields: "id,name,language,status,category,rejected_reason,components", limit: "100" } },
    fetchImpl,
  );
  return res.data ?? [];
}

/** Statuses Meta lets us edit (not while Pending or Disabled). */
export const EDITABLE_STATUSES = ["APPROVED", "REJECTED", "PAUSED"];

/** Replace a template's content (Meta re-reviews it; name and language can't change). */
export async function editTemplate(
  templateId: string,
  token: string,
  t: NewTemplate,
  opts: { includeCategory: boolean },
  fetchImpl?: FetchLike,
) {
  const { components, category } = buildTemplatePayload(t);
  return graphRequest<{ success: boolean }>(
    templateId,
    token,
    { method: "POST", body: opts.includeCategory ? { category, components } : { components } },
    fetchImpl,
  );
}

/** Delete one language version of a template (by name + Meta's id). */
export async function deleteTemplate(wabaId: string, token: string, name: string, templateId: string, fetchImpl?: FetchLike) {
  return graphRequest<{ success: boolean }>(
    `${wabaId}/message_templates`,
    token,
    { method: "DELETE", query: { name, hsm_id: templateId } },
    fetchImpl,
  );
}

/** Turn stored components back into builder fields, for editing. */
export function formFromComponents(components: TemplateComponent[] | null | undefined, fallbackBody = "") {
  const list = components ?? [];
  const h = list.find((c) => c.type === "HEADER");
  const b = list.find((c) => c.type === "BODY");
  const f = list.find((c) => c.type === "FOOTER");
  const format = (h?.format ?? "TEXT").toUpperCase();
  return {
    headerType: !h ? ("NONE" as const) : format === "IMAGE" ? ("IMAGE" as const) : format === "TEXT" ? ("TEXT" as const) : ("NONE" as const),
    headerText: h && format === "TEXT" ? (h.text ?? "") : "",
    imageUrl: h && format === "IMAGE" ? (h.orbit_image_url ?? h.example?.header_handle?.[0]) : undefined,
    imageHandle: h && format === "IMAGE" ? h.example?.header_handle?.[0] : undefined,
    body: b?.text ?? fallbackBody,
    examples: b?.example?.body_text?.[0] ?? [],
    footer: f?.text ?? "",
    hasButtons: list.some((c) => c.type === "BUTTONS" || c.type === "CAROUSEL"),
  };
}
