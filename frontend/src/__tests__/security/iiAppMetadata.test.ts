/**
 * /.well-known/ii-app-metadata (issue #728; internet-identity skill,
 * references/app-metadata.md). Internet Identity reads it from the derivation
 * origin to show HomeGentic's name, tagline and logo on its sign-in screen and
 * on notifications. One bad field makes II ignore the whole document, so the
 * build validates it against the skill's rules and fails on a break.
 */
import { describe, it, expect, afterAll } from "vitest";
import { readFileSync, mkdtempSync, rmSync, existsSync } from "fs";
import { resolve, join } from "path";
import { execFileSync } from "child_process";
import os from "os";
// @ts-expect-error -- plain .mjs build script, no type declarations
import { APP_METADATA, LOGO_PATH, appMetadataProblems, pngInfo } from "../../../scripts/iiAppMetadata.mjs";

const FRONTEND = resolve(__dirname, "../../..");

describe("the published document", () => {
  it("passes every rule II applies", () => {
    expect(appMetadataProblems(APP_METADATA)).toEqual([]);
  });

  it("names HomeGentic and points at the logo by a relative path", () => {
    expect(APP_METADATA.name).toBe("HomeGentic");
    expect(APP_METADATA.logo).toBe(LOGO_PATH);
    expect(LOGO_PATH).toMatch(/^\/[^/]/);
  });
});

describe("appMetadataProblems", () => {
  const ok = { name: "HomeGentic", description: "A tagline", logo: "/ii-logo.png" };

  it("counts name and description length in code points", () => {
    expect(appMetadataProblems({ ...ok, name: "😀".repeat(40) })).toEqual([]);
    expect(appMetadataProblems({ ...ok, name: "😀".repeat(41) })).toHaveLength(1);
    expect(appMetadataProblems({ ...ok, description: "a".repeat(120) })).toEqual([]);
    expect(appMetadataProblems({ ...ok, description: "a".repeat(121) })).toHaveLength(1);
  });

  it("rejects a field with no visible character", () => {
    expect(appMetadataProblems({ ...ok, name: " \t " })).toHaveLength(1);
    expect(appMetadataProblems({ ...ok, description: "​" })).toHaveLength(1);
    expect(appMetadataProblems({ ...ok, name: "" })).toHaveLength(1);
  });

  it("rejects control characters, U+FEFF and bidi overrides, but allows ASCII whitespace and marks", () => {
    expect(appMetadataProblems({ ...ok, name: "Home\u0000" })).toHaveLength(1);
    expect(appMetadataProblems({ ...ok, name: "Home\u007F" })).toHaveLength(1);
    expect(appMetadataProblems({ ...ok, name: "﻿Home" })).toHaveLength(1);
    expect(appMetadataProblems({ ...ok, name: "Home‮" })).toHaveLength(1);
    expect(appMetadataProblems({ ...ok, description: "Home\tGentic\n‎​" })).toEqual([]);
  });

  it("requires isolates to be balanced", () => {
    expect(appMetadataProblems({ ...ok, name: "⁨Home⁩" })).toEqual([]);
    expect(appMetadataProblems({ ...ok, name: "⁨Home" })).toHaveLength(1);
    expect(appMetadataProblems({ ...ok, name: "Home⁩" })).toHaveLength(1);
  });

  it("requires a non-empty same-origin relative logo URL", () => {
    expect(appMetadataProblems({ ...ok, logo: "https://abcde-cai.icp0.io/ii-logo.png" })).toHaveLength(1);
    expect(appMetadataProblems({ ...ok, logo: "//cdn.example/logo.png" })).toHaveLength(1);
    expect(appMetadataProblems({ ...ok, logo: "" })).toHaveLength(1);
  });

  it("rejects non-string fields, a document with no known field, and one over 8 KiB", () => {
    expect(appMetadataProblems({ ...ok, name: 7 })).toHaveLength(1);
    expect(appMetadataProblems({ other: "x" })).toHaveLength(1);
    expect(appMetadataProblems({ ...ok, padding: "x".repeat(8 * 1024) })).toHaveLength(1);
  });
});

describe("the logo file", () => {
  const bytes = readFileSync(join(FRONTEND, "public", LOGO_PATH.slice(1)));

  it("is a PNG (II rejects SVG) of at most 1 MiB", () => {
    expect(pngInfo(bytes)).not.toBeNull();
    expect(bytes.length).toBeLessThanOrEqual(1024 * 1024);
  });

  it("is square and about 512 px, within II's 4096 px limit", () => {
    const { width, height } = pngInfo(bytes);
    expect(width).toBe(height);
    expect(width).toBeGreaterThanOrEqual(256);
    expect(width).toBeLessThanOrEqual(1024);
  });

  it("pngInfo refuses something that isn't a PNG", () => {
    expect(pngInfo(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"))).toBeNull();
  });
});

describe("gen-ic-assets.mjs", () => {
  const dist = mkdtempSync(join(os.tmpdir(), "ii-app-metadata-"));
  afterAll(() => rmSync(dist, { recursive: true, force: true }));
  execFileSync("node", [join(FRONTEND, "scripts/gen-ic-assets.mjs")], {
    env: { ...process.env, IC_ASSETS_DIST: dist, VITE_VOICE_AGENT_URL: "https://voice.example", DFX_NETWORK: "local" },
    stdio: "pipe",
  });
  // _headers as { pattern: ["Name: value", ...] }: a pattern line, then indented header lines.
  const headers: Record<string, string[]> = {};
  let current = "";
  for (const line of readFileSync(join(dist, "_headers"), "utf8").split("\n")) {
    if (line.startsWith("/")) headers[(current = line.trim())] = [];
    else if (line.startsWith("  ") && current) headers[current].push(line.trim());
    else current = "";
  }

  it("writes the document under .well-known", () => {
    const file = join(dist, ".well-known", "ii-app-metadata");
    expect(existsSync(file)).toBe(true);
    const body = readFileSync(file, "utf8");
    expect(JSON.parse(body)).toEqual(APP_METADATA);
    expect(Buffer.byteLength(body)).toBeLessThanOrEqual(8 * 1024);
  });

  it("serves the document as JSON with CORS", () => {
    expect(headers["/.well-known/ii-app-metadata"]).toEqual(
      expect.arrayContaining(["Access-Control-Allow-Origin: *", "Content-Type: application/json"]),
    );
  });

  it("serves the logo with CORS", () => {
    expect(headers[LOGO_PATH]).toContain("Access-Control-Allow-Origin: *");
  });
});
