/**
 * src/inbox.ts — forwarded invoices become draft jobs.
 *
 * INBOX.1  only h-<20 hex>@INBOX_DOMAIN addresses are inbox addresses
 * INBOX.2  the model's JSON is clamped; non-records and bad JSON give null
 * INBOX.3  a PDF attachment is sent as a document block, an image as an image
 * INBOX.4  handleInbound files a draft for a record and nothing otherwise
 */

import { describe, it, expect, jest } from "@jest/globals";
import { inboxToken, parseInvoice, parseMail, extractInvoice, handleInbound, MAX_RAW_BYTES, type InboxDeps } from "../src/inbox";

const TOKEN  = "aaaaaaaaaaaaaaaaaaaa";
const DOMAIN = "in.homegentic.app";

const RECORD = JSON.stringify({
  isRecord: true, title: "AC tune-up", serviceType: "HVAC", contractorName: "Cool Air LLC",
  amountCents: 18900, completedDate: "2026-09-14", warrantyMonths: 12, description: "Cleaned coils, topped up refrigerant.",
});

function mime(opts: { attachment?: { type: string; name: string; base64: string } } = {}): Uint8Array {
  const b = "XBOUNDARYX";
  const parts = [
    "From: Cool Air <billing@coolair.example>",
    "To: h-" + TOKEN + "@" + DOMAIN,
    "Subject: Invoice #1042",
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${b}"`,
    "",
    `--${b}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    "Thanks for your business. Total due $189.00.",
  ];
  if (opts.attachment) {
    parts.push(
      `--${b}`,
      `Content-Type: ${opts.attachment.type}; name="${opts.attachment.name}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${opts.attachment.name}"`,
      "",
      opts.attachment.base64,
    );
  }
  parts.push(`--${b}--`, "");
  return new TextEncoder().encode(parts.join("\r\n"));
}

function provider(reply: string) {
  const complete = jest.fn(async (_req: any) => reply);
  return { complete, stream: jest.fn() } as any;
}

describe("INBOX.1 inboxToken", () => {
  it("accepts the domain's h- addresses, case-insensitively", () => {
    expect(inboxToken(`h-${TOKEN}@${DOMAIN}`, DOMAIN)).toBe(TOKEN);
    expect(inboxToken(`H-${TOKEN.toUpperCase()}@IN.HomeGentic.app`, DOMAIN)).toBe(TOKEN);
  });
  it("rejects other domains and malformed tokens", () => {
    expect(inboxToken(`h-${TOKEN}@evil.example`, DOMAIN)).toBeNull();
    expect(inboxToken(`h-${TOKEN.slice(1)}@${DOMAIN}`, DOMAIN)).toBeNull();
    expect(inboxToken(`support@${DOMAIN}`, DOMAIN)).toBeNull();
  });
});

describe("INBOX.2 parseInvoice", () => {
  it("reads a record, even wrapped in prose", () => {
    expect(parseInvoice("Here you go:\n" + RECORD)).toEqual({
      title: "AC tune-up", serviceType: "HVAC", contractorName: "Cool Air LLC", amountCents: 18900,
      completedDate: "2026-09-14", warrantyMonths: 12, description: "Cleaned coils, topped up refrigerant.",
    });
  });
  it("returns null for non-records, missing titles and bad JSON", () => {
    expect(parseInvoice(JSON.stringify({ isRecord: false, title: "Newsletter" }))).toBeNull();
    expect(parseInvoice(JSON.stringify({ isRecord: true, title: "" }))).toBeNull();
    expect(parseInvoice("{not json")).toBeNull();
    expect(parseInvoice("no json at all")).toBeNull();
  });
  it("clamps odd values", () => {
    const d = parseInvoice(JSON.stringify({
      isRecord: true, title: "x".repeat(500), serviceType: "Rocket Repair", amountCents: -5,
      completedDate: "Sept 14", warrantyMonths: 99999,
    }))!;
    expect(d.title).toHaveLength(120);
    expect(d.serviceType).toBe("");
    expect(d.amountCents).toBe(0);
    expect(d.completedDate).toBe("");
    expect(d.warrantyMonths).toBe(600);
  });
});

describe("INBOX.3 parseMail + extractInvoice", () => {
  it("uses the text when there is no attachment", async () => {
    const mail = await parseMail(mime());
    expect(mail.from).toBe("billing@coolair.example");
    expect(mail.subject).toBe("Invoice #1042");
    expect(mail.text).toContain("Total due $189.00");
    expect(mail.attachment).toBeNull();
  });

  it("sends a PDF as a document block", async () => {
    const pdf = Buffer.from("%PDF-1.4 fake").toString("base64");
    const mail = await parseMail(mime({ attachment: { type: "application/pdf", name: "inv.pdf", base64: pdf } }));
    expect(mail.attachment?.mimeType).toBe("application/pdf");
    const p = provider(RECORD);
    await extractInvoice(mail, p);
    const content = p.complete.mock.calls[0][0].messages[0].content;
    expect(content[0]).toMatchObject({ type: "document", source: { media_type: "application/pdf" } });
    expect(content[1].text).toContain("Subject: Invoice #1042");
  });

  it("sends an image as an image block and ignores unreadable types", async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString("base64");
    const p = provider(RECORD);
    await extractInvoice(await parseMail(mime({ attachment: { type: "image/png", name: "a.png", base64: png } })), p);
    expect(p.complete.mock.calls[0][0].messages[0].content[0]).toMatchObject({ type: "image", source: { media_type: "image/png" } });

    const zip = await parseMail(mime({ attachment: { type: "application/zip", name: "a.zip", base64: png } }));
    expect(zip.attachment).toBeNull();
  });
});

describe("INBOX.4 handleInbound", () => {
  function deps(reply: string, res: "ok" | "unknown" | "rejected" = "ok") {
    const addDraft = jest.fn(async (..._a: any[]) => res);
    return { deps: { provider: provider(reply), addDraft } as unknown as InboxDeps, addDraft };
  }
  const to = `h-${TOKEN}@${DOMAIN}`;

  it("files a draft for a record", async () => {
    const { deps: d, addDraft } = deps(RECORD);
    const raw = mime();
    expect(await handleInbound(to, raw, raw.byteLength, DOMAIN, d)).toBe("drafted");
    expect(addDraft).toHaveBeenCalledWith(TOKEN, "billing@coolair.example", "Invoice #1042", expect.objectContaining({ title: "AC tune-up", amountCents: 18900 }));
  });

  it("does nothing for other addresses, oversized mail and non-records", async () => {
    const raw = mime();
    const a = deps(RECORD);
    expect(await handleInbound(`someone@${DOMAIN}`, raw, raw.byteLength, DOMAIN, a.deps)).toBe("not-inbox");
    expect(await handleInbound(to, raw, MAX_RAW_BYTES + 1, DOMAIN, a.deps)).toBe("too-large");
    expect(a.addDraft).not.toHaveBeenCalled();

    const b = deps(JSON.stringify({ isRecord: false }));
    expect(await handleInbound(to, raw, raw.byteLength, DOMAIN, b.deps)).toBe("not-a-record");
    expect(b.addDraft).not.toHaveBeenCalled();
  });

  it("reports unknown addresses and canister rejections", async () => {
    const raw = mime();
    expect(await handleInbound(to, raw, raw.byteLength, DOMAIN, deps(RECORD, "unknown").deps)).toBe("unknown-address");
    expect(await handleInbound(to, raw, raw.byteLength, DOMAIN, deps(RECORD, "rejected").deps)).toBe("rejected");
  });
});
