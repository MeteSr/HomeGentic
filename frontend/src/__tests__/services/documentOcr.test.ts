/**
 * documentOcr — real logic worth locking down:
 *   - extractDocument POSTs fileName/mimeType/base64Data as JSON and
 *     returns the parsed extraction on success
 *   - on a non-ok response, it throws the server's error message when
 *     present, falling back to the response's statusText, and to a
 *     generic message when the error body itself can't be parsed
 *   - fileToBase64 strips the "data:...;base64," prefix from the
 *     FileReader result, using the real browser FileReader (not
 *     mocked — jsdom implements it)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { extractDocument, fileToBase64 } from "@/services/documentOcr";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn());
});

describe("extractDocument — request and success", () => {
  it("POSTs fileName/mimeType/base64Data and returns the parsed extraction", async () => {
    const extraction = { documentType: "warranty", confidence: "high", description: "A warranty card" };
    (fetch as any).mockResolvedValue({ ok: true, json: async () => extraction });

    const result = await extractDocument("card.jpg", "image/jpeg", "base64data");

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/extract-document"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ fileName: "card.jpg", mimeType: "image/jpeg", base64Data: "base64data" }),
      })
    );
    expect(result).toEqual(extraction);
  });
});

describe("extractDocument — error handling", () => {
  it("throws the server's error message when present", async () => {
    (fetch as any).mockResolvedValue({ ok: false, statusText: "Bad Request", json: async () => ({ error: "Unsupported file type" }) });
    await expect(extractDocument("a", "b", "c")).rejects.toThrow("Unsupported file type");
  });

  it("falls back to statusText when the error body has no error field", async () => {
    (fetch as any).mockResolvedValue({ ok: false, statusText: "Internal Server Error", json: async () => ({}) });
    await expect(extractDocument("a", "b", "c")).rejects.toThrow("Document extraction failed");
  });

  it("falls back to a generic message when the error body itself fails to parse", async () => {
    (fetch as any).mockResolvedValue({ ok: false, statusText: "Internal Server Error", json: async () => { throw new Error("not json"); } });
    await expect(extractDocument("a", "b", "c")).rejects.toThrow("Internal Server Error");
  });
});

describe("fileToBase64", () => {
  it("strips the data-url prefix from the FileReader result", async () => {
    const file = new File(["hello"], "test.txt", { type: "text/plain" });
    const result = await fileToBase64(file);
    // "hello" base64-encoded is aGVsbG8=
    expect(result).toBe("aGVsbG8=");
  });
});
