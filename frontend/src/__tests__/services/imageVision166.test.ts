/**
 * TDD tests for §16.6 — Receipt & Document Photo Parsing (Vision)
 *
 * Covers:
 *   - buildImageUserMessage() — builds a Claude-compatible user message with an image block (16.6.1 / 16.6.2)
 *   - fileToBase64() — encodes a browser File to a raw base64 string (16.6.1)
 *   - System prompt includes receipt extraction instructions (16.6.3)
 */

import { describe, it, expect } from "vitest";
import { buildImageUserMessage, fileToBase64 } from "@/services/imageUtils";

// ─── buildImageUserMessage ─────────────────────────────────────────────────────

describe("buildImageUserMessage", () => {
  it("returns role 'user'", () => {
    const msg = buildImageUserMessage("log this receipt", "abc123==", "image/jpeg");
    expect(msg.role).toBe("user");
  });

  it("content is an array with an image block first and a text block second", () => {
    const msg = buildImageUserMessage("log this", "abc123==", "image/jpeg");
    expect(Array.isArray(msg.content)).toBe(true);
    expect(msg.content).toHaveLength(2);
    expect(msg.content[0].type).toBe("image");
    expect(msg.content[1].type).toBe("text");
  });

  it("image block has base64 source type with the provided data", () => {
    const data = "iVBORw0KGgoAAAANS";
    const msg = buildImageUserMessage("scan this", data, "image/png");
    const imageBlock = msg.content[0] as any;
    expect(imageBlock.source.type).toBe("base64");
    expect(imageBlock.source.data).toBe(data);
  });

  it("image block preserves the provided media type", () => {
    const msg = buildImageUserMessage("receipt", "abc", "image/webp");
    const imageBlock = msg.content[0] as any;
    expect(imageBlock.source.media_type).toBe("image/webp");
  });

  it("text block contains the provided user text", () => {
    const msg = buildImageUserMessage("Here is my receipt", "abc", "image/jpeg");
    const textBlock = msg.content[1] as any;
    expect(textBlock.text).toBe("Here is my receipt");
  });

  it("works with an empty text string", () => {
    const msg = buildImageUserMessage("", "abc123", "image/jpeg");
    const textBlock = msg.content[1] as any;
    expect(textBlock.text).toBe("");
  });

  it("works with all supported MIME types", () => {
    const mimes = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
    for (const mime of mimes) {
      const msg = buildImageUserMessage("test", "data", mime);
      const imageBlock = msg.content[0] as any;
      expect(imageBlock.source.media_type).toBe(mime);
    }
  });

  it("structure matches Claude API ImageBlockParam shape", () => {
    const msg = buildImageUserMessage("Here is a receipt", "base64data==", "image/jpeg");
    const imageBlock = msg.content[0] as any;

    // Must match Anthropic SDK shape: { type: "image", source: { type: "base64", media_type, data } }
    expect(imageBlock).toMatchObject({
      type:   "image",
      source: {
        type:       "base64",
        media_type: "image/jpeg",
        data:       "base64data==",
      },
    });
  });
});

// ─── fileToBase64 ──────────────────────────────────────────────────────────────

describe("fileToBase64", () => {
  it("resolves with a non-empty base64 string for a non-empty file", async () => {
    const blob = new Blob(["hello receipt"], { type: "image/jpeg" });
    const file = new File([blob], "receipt.jpg", { type: "image/jpeg" });

    const result = await fileToBase64(file);

    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("does NOT include the data URI prefix (data:image/...;base64,)", async () => {
    const blob = new Blob(["test content"], { type: "image/png" });
    const file = new File([blob], "img.png", { type: "image/png" });

    const result = await fileToBase64(file);

    expect(result).not.toMatch(/^data:/);
    expect(result).not.toContain(";base64,");
  });

  it("result is valid base64 (only contains base64 alphabet characters)", async () => {
    const blob = new Blob(["receipt data 123"], { type: "image/jpeg" });
    const file = new File([blob], "r.jpg", { type: "image/jpeg" });

    const result = await fileToBase64(file);

    // Base64 alphabet: A-Z, a-z, 0-9, +, /, =
    expect(result).toMatch(/^[A-Za-z0-9+/=]+$/);
  });

  it("roundtrips — decoding the base64 recovers the original bytes", async () => {
    const originalText = "HomeFax receipt content";
    const blob = new Blob([originalText], { type: "image/jpeg" });
    const file = new File([blob], "r.jpg", { type: "image/jpeg" });

    const base64 = await fileToBase64(file);
    const decoded = atob(base64);

    expect(decoded).toBe(originalText);
  });
});
