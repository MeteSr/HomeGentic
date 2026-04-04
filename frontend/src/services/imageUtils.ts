/**
 * Image encoding utilities for the HomeFax voice agent.
 * Builds Claude-compatible image message blocks from browser File/Blob inputs.
 */

export type SupportedImageMimeType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

export interface ImageContentBlock {
  type: "image";
  source: {
    type:       "base64";
    media_type: string;
    data:       string;
  };
}

export interface TextContentBlock {
  type: "text";
  text: string;
}

export interface ImageUserMessage {
  role: "user";
  content: [ImageContentBlock, TextContentBlock];
}

/**
 * Builds a Claude API-compatible user message with an image block followed by
 * a text block. The image block uses base64 encoding as required by the API.
 */
export function buildImageUserMessage(
  text:      string,
  base64:    string,
  mediaType: string,
): ImageUserMessage {
  return {
    role: "user",
    content: [
      {
        type:   "image",
        source: { type: "base64", media_type: mediaType, data: base64 },
      },
      {
        type: "text",
        text,
      },
    ],
  };
}

/**
 * Reads a browser File as a raw base64 string (no data URI prefix).
 * Suitable for passing directly to the Claude API source.data field.
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip "data:<mime>;base64," prefix — Claude API wants raw base64 only
      const base64 = result.split(",")[1] ?? "";
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error ?? new Error("FileReader error"));
    reader.readAsDataURL(file);
  });
}
