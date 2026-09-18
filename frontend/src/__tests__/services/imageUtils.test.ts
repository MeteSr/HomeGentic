/**
 * imageUtils — real logic worth locking down:
 *   - buildImageUserMessage shapes a Claude-compatible message with an
 *     image block (base64 source.data) followed by a text block
 *   - fileToBase64 strips the "data:<mime>;base64," prefix FileReader
 *     produces, leaving raw base64 only
 */

import { describe, it, expect } from "vitest";
import { buildImageUserMessage, fileToBase64 } from "@/services/imageUtils";

describe("buildImageUserMessage", () => {
  it("builds an image block followed by a text block", () => {
    const message = buildImageUserMessage("What is this?", "AAAA", "image/png");

    expect(message).toEqual({
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: "image/png", data: "AAAA" } },
        { type: "text", text: "What is this?" },
      ],
    });
  });

  it("preserves the exact media type passed in", () => {
    const message = buildImageUserMessage("desc", "base64data", "image/webp");
    expect(message.content[0].source.media_type).toBe("image/webp");
  });
});

describe("fileToBase64", () => {
  it("strips the data URI prefix, leaving raw base64", async () => {
    const file = new File(["hello"], "test.png", { type: "image/png" });
    const result = await fileToBase64(file);
    expect(result).not.toContain("data:");
    expect(result).not.toContain(";base64,");
    expect(typeof result).toBe("string");
  });

  it("rejects when the FileReader errors", async () => {
    const file = new File(["x"], "bad.png", { type: "image/png" });
    const originalReadAsDataURL = FileReader.prototype.readAsDataURL;
    FileReader.prototype.readAsDataURL = function (this: FileReader) {
      this.dispatchEvent(new Event("error"));
    };

    try {
      await expect(fileToBase64(file)).rejects.toBeTruthy();
    } finally {
      FileReader.prototype.readAsDataURL = originalReadAsDataURL;
    }
  });
});
