import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { getAdapter, waMeLink } from "./messaging";
import { buildMetaPayload, createMetaAdapter } from "./messaging/meta";
import { canMessageCustomer, isQuietHours, isStopMessage } from "./messaging/rules";
import { verifyMetaSignature } from "./meta/signature";
import { buildTemplatePayload, countPlaceholders, fillTemplate, toTemplateName, validateTemplate } from "./meta/templates";
import { parseWebhook } from "./meta/webhook";
import { formatPhone, normalizePhone } from "./phone";

describe("phone numbers", () => {
  it.each([
    ["98400 12345", "919840012345"],
    ["+91 98400-12345", "919840012345"],
    ["09840012345", "919840012345"],
    ["919840012345", "919840012345"],
    ["0091 9840012345", "919840012345"],
  ])("%s → %s", (input, out) => {
    expect(normalizePhone(input)).toEqual({ ok: true, phone: out });
  });

  it("rejects landlines and short numbers", () => {
    expect(normalizePhone("044 2345 6789").ok).toBe(false);
    expect(normalizePhone("12345").ok).toBe(false);
    expect(normalizePhone("").ok).toBe(false);
  });

  it("keeps foreign numbers given with +", () => {
    expect(normalizePhone("+1 415 555 0100")).toEqual({ ok: true, phone: "14155550100" });
  });

  it("formats for display", () => {
    expect(formatPhone("919840012345")).toBe("+91 98400 12345");
  });
});

describe("messaging adapter", () => {
  const template = {
    kind: "template" as const,
    to: "919840012345",
    templateName: "visit_checkin",
    language: "en",
    bodyParams: ["Priya", "Ravi"],
    previewText: "Hi Priya, Ravi here. Is everything good after today's visit?",
  };

  it("wa.me mode returns a one-tap link with the full text", async () => {
    const r = await getAdapter("wame").send(template, {});
    expect(r).toEqual({ status: "link", mode: "wame", link: waMeLink("919840012345", template.previewText) });
    expect(r.status === "link" && r.link).toContain("https://wa.me/919840012345?text=Hi%20Priya");
  });

  it("builds Meta template payloads with body parameters", () => {
    expect(buildMetaPayload(template)).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "919840012345",
      type: "template",
      template: {
        name: "visit_checkin",
        language: { code: "en" },
        components: [{ type: "body", parameters: [{ type: "text", text: "Priya" }, { type: "text", text: "Ravi" }] }],
      },
    });
  });

  it("Meta mode posts to the phone number and returns the message id", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ messages: [{ id: "wamid.ABC" }] }), { status: 200 }),
    );
    const r = await createMetaAdapter(fetchMock).send(template, { phoneNumberId: "123", accessToken: "tok" });
    expect(r).toEqual({ status: "sent", mode: "meta", providerMessageId: "wamid.ABC" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/graph\.facebook\.com\/v\d+\.\d+\/123\/messages$/);
    expect(init.headers.Authorization).toBe("Bearer tok");
  });

  it("Meta mode reports Meta's error text", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "Template name does not exist", code: 132001 } }), { status: 400 }),
    );
    const r = await createMetaAdapter(fetchMock).send(template, { phoneNumberId: "123", accessToken: "tok" });
    expect(r).toEqual({ status: "failed", mode: "meta", error: "Template name does not exist", code: 132001 });
  });

  it("Meta mode refuses without a connection", async () => {
    const r = await createMetaAdapter(vi.fn()).send(template, {});
    expect(r.status).toBe("failed");
  });
});

describe("ground rules", () => {
  it("recognises STOP in English and Tamil", () => {
    expect(isStopMessage("STOP")).toBe(true);
    expect(isStopMessage(" stop. ")).toBe(true);
    expect(isStopMessage("வேண்டாம்")).toBe(true);
    expect(isStopMessage("please don't stop the offers")).toBe(false);
  });

  it("quiet hours are 20:00–9:00 India time", () => {
    // 14:30 UTC = 20:00 IST
    expect(isQuietHours(new Date("2026-11-14T14:30:00Z"))).toBe(true);
    // 03:29 UTC = 08:59 IST
    expect(isQuietHours(new Date("2026-11-14T03:29:00Z"))).toBe(true);
    // 03:30 UTC = 09:00 IST
    expect(isQuietHours(new Date("2026-11-14T03:30:00Z"))).toBe(false);
    // 14:29 UTC = 19:59 IST
    expect(isQuietHours(new Date("2026-11-14T14:29:00Z"))).toBe(false);
  });

  it("blocks opted-out, unconsented and night-time sends", () => {
    const day = new Date("2026-11-14T06:00:00Z");
    expect(canMessageCustomer({ consent_at: "x", opted_out_at: null }, day)).toEqual({ ok: true });
    expect(canMessageCustomer({ consent_at: "x", opted_out_at: "y" }, day).ok).toBe(false);
    expect(canMessageCustomer({ consent_at: null, opted_out_at: null }, day).ok).toBe(false);
    expect(canMessageCustomer({ consent_at: "x", opted_out_at: null }, new Date("2026-11-14T16:00:00Z")).ok).toBe(false);
  });
});

describe("webhook", () => {
  it("accepts only correctly signed bodies", () => {
    const body = JSON.stringify({ hello: "world" });
    const sig = "sha256=" + createHmac("sha256", "secret").update(body).digest("hex");
    expect(verifyMetaSignature(body, sig, "secret")).toBe(true);
    expect(verifyMetaSignature(body, sig, "wrong")).toBe(false);
    expect(verifyMetaSignature(body + " ", sig, "secret")).toBe(false);
    expect(verifyMetaSignature(body, null, "secret")).toBe(false);
  });

  it("parses incoming messages, statuses and template updates", () => {
    const events = parseWebhook({
      object: "whatsapp_business_account",
      entry: [
        {
          id: "WABA1",
          changes: [
            {
              field: "messages",
              value: {
                metadata: { phone_number_id: "PN1" },
                contacts: [{ wa_id: "919840012345", profile: { name: "Priya" } }],
                messages: [{ from: "919840012345", id: "wamid.IN", timestamp: "1763100000", type: "text", text: { body: "All good, thanks!" } }],
                statuses: [
                  {
                    id: "wamid.OUT",
                    status: "delivered",
                    timestamp: "1763100100",
                    recipient_id: "919840012345",
                    pricing: { category: "utility" },
                  },
                ],
              },
            },
            {
              field: "message_template_status_update",
              value: { event: "APPROVED", message_template_id: 99, message_template_name: "visit_checkin", message_template_language: "en", reason: "NONE" },
            },
          ],
        },
      ],
    });

    expect(events).toHaveLength(3);
    expect(events[0]).toMatchObject({ type: "inbound", from: "919840012345", profileName: "Priya", text: "All good, thanks!", phoneNumberId: "PN1" });
    expect(events[1]).toMatchObject({ type: "status", waMessageId: "wamid.OUT", status: "delivered", pricingCategory: "utility" });
    expect(events[2]).toEqual({ type: "template_status", wabaId: "WABA1", templateId: "99", name: "visit_checkin", language: "en", event: "APPROVED", reason: undefined });
  });

  it("ignores other webhook objects", () => {
    expect(parseWebhook({ object: "page", entry: [] })).toEqual([]);
  });
});

describe("templates", () => {
  const t = {
    name: "visit_checkin",
    language: "en",
    category: "UTILITY" as const,
    body: "Hi {{1}}, this is {{2}}. Is everything good after today's visit?",
    examples: ["Priya", "Ravi"],
  };

  it("cleans names to Meta's format", () => {
    expect(toTemplateName("Visit Check-in (Tamil)")).toBe("visit_check_in_tamil");
  });

  it("counts and fills placeholders", () => {
    expect(countPlaceholders(t.body)).toBe(2);
    expect(fillTemplate(t.body, ["Priya", "Ravi"])).toBe("Hi Priya, this is Ravi. Is everything good after today's visit?");
  });

  it("validates before sending to Meta", () => {
    expect(validateTemplate(t)).toEqual([]);
    expect(validateTemplate({ ...t, examples: ["Priya"] })).toContain("Give an example value for each of the 2 placeholders");
    expect(validateTemplate({ ...t, body: "Hi {{1}}, see {{3}}" }).join()).toContain("{{2}} is missing");
    expect(validateTemplate({ ...t, body: "{{1}} hello" }).join()).toContain("starts or ends");
    expect(validateTemplate({ ...t, name: "Bad Name" }).length).toBeGreaterThan(0);
  });

  it("builds Meta's create-template body with examples", () => {
    expect(buildTemplatePayload(t)).toEqual({
      name: "visit_checkin",
      language: "en",
      category: "UTILITY",
      components: [{ type: "BODY", text: t.body, example: { body_text: [["Priya", "Ravi"]] } }],
    });
  });
});

import { fillBlanks, templateView } from "./meta/template-view";

describe("template preview", () => {
  const orderConfirmation = [
    { type: "HEADER", format: "TEXT", text: "Order confirmed" },
    { type: "BODY", text: "Hi {{1}}, your order number is {{2}}. Delivery: {{3}}." },
    { type: "FOOTER", text: "Jasper's Market" },
    { type: "BUTTONS", buttons: [{ type: "URL", text: "Visit order details", url: "https://example.com/orders" }] },
  ];

  it("reads heading, text, footer, buttons and blanks", () => {
    const v = templateView(orderConfirmation);
    expect(v.header).toEqual({ kind: "text", text: "Order confirmed" });
    expect(v.footer).toBe("Jasper's Market");
    expect(v.buttons).toEqual([{ type: "URL", text: "Visit order details", url: "https://example.com/orders" }]);
    expect(v.blanks).toBe(3);
    expect(v.sendable).toBe(true);
  });

  it("flags templates the simple sender can't fill", () => {
    expect(templateView([{ type: "HEADER", format: "IMAGE" }, { type: "BODY", text: "Hi" }]).sendable).toBe(false);
    expect(templateView([{ type: "BODY", text: "x" }, { type: "CAROUSEL" }]).sendable).toBe(false);
    expect(
      templateView([{ type: "BODY", text: "x" }, { type: "BUTTONS", buttons: [{ type: "URL", text: "Go", url: "https://a.com/{{1}}" }] }]).sendable,
    ).toBe(false);
  });

  it("falls back to stored body text when components are missing", () => {
    expect(templateView(null, "Hello {{1}}").blanks).toBe(1);
  });

  it("fills blanks live and keeps empty ones visible", () => {
    expect(fillBlanks("Hi {{1}}, order {{2}}", ["Priya"])).toBe("Hi Priya, order {{2}}");
  });
});
