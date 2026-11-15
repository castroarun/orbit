import { graphRequest, type FetchLike } from "./graph";

/**
 * WhatsApp message templates (Meta must approve each format once).
 * Body placeholders are {{1}}, {{2}}… and Meta wants one example value for each.
 */

export type TemplateCategory = "UTILITY" | "MARKETING";

export type NewTemplate = {
  name: string;
  language: string;
  category: TemplateCategory;
  body: string;
  examples: string[];
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

  return {
    name: t.name,
    language: t.language,
    category: t.category,
    components: [bodyComponent, ...(t.footer ? [{ type: "FOOTER", text: t.footer }] : [])],
  };
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
