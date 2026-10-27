/**
 * The web side of universal links (scripts/appLinks.mjs) must list the same
 * paths and bundle id as the mobile app, or links open the browser instead.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
// @ts-expect-error — plain .mjs build helper, no types
import { BUNDLE_ID, PATHS, wellKnownFiles } from "../../../scripts/appLinks.mjs";

const MOBILE = resolve(__dirname, "../../../../mobile");

describe("universal links", () => {
  it("lists the same paths as the mobile app", () => {
    const src = readFileSync(resolve(MOBILE, "src/services/deepLinks.ts"), "utf8");
    const m = src.match(/UNIVERSAL_LINK_PATHS = \[([^\]]*)\]/);
    const mobilePaths = [...(m?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((x) => x[1]);
    expect(mobilePaths.sort()).toEqual([...PATHS].sort());
  });

  it("uses the app's bundle id", () => {
    const app = JSON.parse(readFileSync(resolve(MOBILE, "app.json"), "utf8"));
    expect(app.expo.ios.bundleIdentifier).toBe(BUNDLE_ID);
    expect(app.expo.android.package).toBe(BUNDLE_ID);
  });

  it("writes nothing until the store ids are set", () => {
    expect(wellKnownFiles({})).toEqual({});
  });

  it("builds both files from the ids", () => {
    const files = wellKnownFiles({ APPLE_TEAM_ID: "TEAM123", ANDROID_CERT_SHA256: "aa:bb, cc:dd" });
    expect(files["apple-app-site-association"].applinks.details[0]).toEqual({
      appIDs: ["TEAM123.app.homegentic.mobile"],
      components: PATHS.map((p: string) => ({ "/": p })),
    });
    expect(files["assetlinks.json"][0].target.sha256_cert_fingerprints).toEqual(["AA:BB", "CC:DD"]);
  });
});
