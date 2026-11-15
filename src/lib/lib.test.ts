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
    expect(templateView([{ type: "HEADER", format: "DOCUMENT" }, { type: "BODY", text: "Hi" }]).sendable).toBe(false);
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

import { componentsToStore } from "./meta/templates";
import { uploadSampleToMeta } from "./meta/upload";

describe("picture templates", () => {
  const base = { name: "festival_offer", language: "en", category: "MARKETING" as const, body: "Hi {{1}}, our Pongal offer is here!", examples: ["Priya"] };

  it("builds an image heading for Meta and keeps our own copy for previews", () => {
    const t = { ...base, header: { type: "IMAGE" as const, handle: "4::abc", imageUrl: "https://x/p.jpg" }, footer: "AS Groups" };
    expect(buildTemplatePayload(t).components[0]).toEqual({ type: "HEADER", format: "IMAGE", example: { header_handle: ["4::abc"] } });
    expect(componentsToStore(t)[0]).toMatchObject({ format: "IMAGE", orbit_image_url: "https://x/p.jpg" });
    expect(buildTemplatePayload(t).components.at(-1)).toEqual({ type: "FOOTER", text: "AS Groups" });
  });

  it("validates headings and footers", () => {
    expect(validateTemplate({ ...base, header: { type: "TEXT", text: "x".repeat(61) } }).join()).toContain("Heading is over 60");
    expect(validateTemplate({ ...base, footer: "y".repeat(61) }).join()).toContain("Footer is over 60");
  });

  it("previews and allows sending picture templates", () => {
    const v = templateView(componentsToStore({ ...base, header: { type: "IMAGE", handle: "h", imageUrl: "https://x/p.jpg" } }));
    expect(v.header).toEqual({ kind: "media", format: "IMAGE", sampleUrl: "https://x/p.jpg" });
    expect(v.sendable).toBe(true);
    expect(templateView([{ type: "HEADER", format: "VIDEO" }, { type: "BODY", text: "x" }]).sendable).toBe(false);
  });

  it("sends the picture as a header parameter", () => {
    const p = buildMetaPayload({ kind: "template", to: "91", templateName: "x", language: "en", headerImageUrl: "https://x/p.jpg", bodyParams: ["Priya"], previewText: "" });
    expect(p).toMatchObject({
      template: {
        components: [
          { type: "header", parameters: [{ type: "image", image: { link: "https://x/p.jpg" } }] },
          { type: "body", parameters: [{ type: "text", text: "Priya" }] },
        ],
      },
    });
  });

  it("uploads a sample picture to Meta in two steps", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "upload:SESSION" })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ h: "4::HANDLE" })));
    const h = await uploadSampleToMeta({ appId: "APP", token: "T", bytes: new ArrayBuffer(10), fileType: "image/jpeg", fileName: "a.jpg" }, fetchMock);
    expect(h).toBe("4::HANDLE");
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/APP\/uploads\?file_name=a\.jpg&file_length=10&file_type=image%2Fjpeg$/);
    expect(String(fetchMock.mock.calls[1][0])).toMatch(/\/upload:SESSION$/);
    expect(fetchMock.mock.calls[1][1].headers).toEqual({ Authorization: "OAuth T", file_offset: "0" });
  });
});

import { STARTERS } from "./template-starters";

describe("template starters", () => {
  it("every starter passes Meta's checks and marketing ones carry a STOP line", () => {
    for (const s of STARTERS.filter((x) => x.id !== "blank")) {
      const errors = validateTemplate({
        name: s.name,
        language: "en",
        category: s.category,
        body: s.body,
        examples: s.examples,
        footer: s.footer,
        header: s.headerType === "TEXT" ? { type: "TEXT", text: s.headerText ?? "" } : s.headerType === "IMAGE" ? { type: "IMAGE", handle: "h", imageUrl: "u" } : undefined,
      });
      expect(errors, s.id).toEqual([]);
      expect(s.examples.length, s.id).toBe(countPlaceholders(s.body));
      if (s.category === "MARKETING") expect(s.footer, s.id).toMatch(/STOP/);
    }
  });
});

import { deleteTemplate, editTemplate, formFromComponents } from "./meta/templates";

describe("edit and delete templates", () => {
  const t = { name: "we_miss_you", language: "en", category: "MARKETING" as const, body: "Hi {{1}}, we miss you!", examples: ["Priya"], footer: "Reply STOP to stop offers" };

  it("edits by template id, without category unless allowed", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true })));
    await editTemplate("TPL1", "tok", t, { includeCategory: false }, fetchMock);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/TPL1$/);
    const body = JSON.parse(init.body);
    expect(body.category).toBeUndefined();
    expect(body.components[0]).toEqual({ type: "BODY", text: "Hi {{1}}, we miss you!", example: { body_text: [["Priya"]] } });
  });

  it("deletes one language version by name and id", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true })));
    await deleteTemplate("WABA", "tok", "we_miss_you", "TPL1", fetchMock);
    const [url, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe("DELETE");
    expect(String(url)).toMatch(/\/WABA\/message_templates\?name=we_miss_you&hsm_id=TPL1$/);
  });

  it("reads stored components back into the builder", () => {
    const f = formFromComponents(componentsToStore({ ...t, header: { type: "IMAGE", handle: "4::h", imageUrl: "https://x/p.jpg" } }));
    expect(f).toMatchObject({ headerType: "IMAGE", imageUrl: "https://x/p.jpg", imageHandle: "4::h", examples: ["Priya"], footer: "Reply STOP to stop offers", hasButtons: false });
  });
});
