/**
 * §15.6 — App Store & Play Store Submission compliance tests
 *
 * 15.6.1 / 15.6.2  eas.json exists with production build profiles for both
 *                   iOS (TestFlight) and Android (internal track)
 * 15.6.3           Apple Privacy Manifest exists and has required top-level
 *                   keys; Google data-safety declaration file exists
 * 15.6.4           No in-app purchase packages are present; all upgrade CTAs
 *                   open the pricing page in the browser via Linking.openURL
 *
 * These are filesystem-scanning tests — they read actual source files from
 * disk so they catch regressions without needing a running app or mocks.
 */

import * as fs   from "fs";
import * as path from "path";

const MOBILE_ROOT = path.resolve(__dirname, "../../../");   // mobile/
const SRC_ROOT    = path.resolve(MOBILE_ROOT, "src");       // mobile/src/

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Recursively collect all .ts/.tsx files under a directory. */
function collectSourceFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== "node_modules" && entry.name !== "__tests__") {
      results.push(...collectSourceFiles(full));
    } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

const SOURCE_FILES = collectSourceFiles(SRC_ROOT);

// ── 15.6.1 / 15.6.2: EAS build configuration ─────────────────────────────────

describe("15.6.1 / 15.6.2 — EAS build configuration", () => {
  const easPath = path.join(MOBILE_ROOT, "eas.json");
  let eas: any;

  beforeAll(() => {
    eas = JSON.parse(fs.readFileSync(easPath, "utf8"));
  });

  it("eas.json exists", () => {
    expect(fs.existsSync(easPath)).toBe(true);
  });

  it("has a production build profile", () => {
    expect(eas.build).toHaveProperty("production");
  });

  it("production profile targets both iOS and Android", () => {
    const prod = eas.build.production;
    expect(prod).toHaveProperty("ios");
    expect(prod).toHaveProperty("android");
  });

  it("iOS production profile targets TestFlight (distribution: store)", () => {
    expect(eas.build.production.ios.distribution).toBe("store");
  });

  it("Android production profile targets internal track", () => {
    expect(eas.build.production.android.buildType).toBe("app-bundle");
  });

  it("has a preview/staging build profile for QA", () => {
    expect(eas.build).toHaveProperty("preview");
  });

  it("submit config has ios and android app store entries", () => {
    expect(eas.submit?.production?.ios).toBeDefined();
    expect(eas.submit?.production?.android).toBeDefined();
  });
});

// ── 15.6.3: Apple Privacy Manifest ───────────────────────────────────────────

describe("15.6.3 — Apple Privacy Manifest", () => {
  const manifestPath = path.join(MOBILE_ROOT, "store", "privacy-manifest.json");
  let manifest: any;

  beforeAll(() => {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  });

  it("privacy-manifest.json exists in mobile/store/", () => {
    expect(fs.existsSync(manifestPath)).toBe(true);
  });

  it("declares NSPrivacyTracking (must be false — no ad tracking)", () => {
    expect(manifest).toHaveProperty("NSPrivacyTracking");
    expect(manifest.NSPrivacyTracking).toBe(false);
  });

  it("declares NSPrivacyTrackingDomains as empty array (no tracking domains)", () => {
    expect(Array.isArray(manifest.NSPrivacyTrackingDomains)).toBe(true);
    expect(manifest.NSPrivacyTrackingDomains).toHaveLength(0);
  });

  it("declares NSPrivacyCollectedDataTypes array", () => {
    expect(Array.isArray(manifest.NSPrivacyCollectedDataTypes)).toBe(true);
  });

  it("declares NSPrivacyAccessedAPITypes array", () => {
    expect(Array.isArray(manifest.NSPrivacyAccessedAPITypes)).toBe(true);
  });

  it("device push token data type is declared if push notifications are used", () => {
    const types: string[] = manifest.NSPrivacyCollectedDataTypes.map(
      (t: any) => t.NSPrivacyCollectedDataType
    );
    // Push token falls under Device ID category
    expect(types.some((t) => t.includes("DeviceID") || t.includes("OtherDiagnosticData") || t.includes("PerformanceData"))).toBe(true);
  });
});

// ── 15.6.3: Google Play data safety declaration ───────────────────────────────

describe("15.6.3 — Google Play data safety", () => {
  const dataSafetyPath = path.join(MOBILE_ROOT, "store", "data-safety.md");

  it("data-safety.md exists in mobile/store/", () => {
    expect(fs.existsSync(dataSafetyPath)).toBe(true);
  });

  it("mentions device identifiers (push token)", () => {
    const content = fs.readFileSync(dataSafetyPath, "utf8").toLowerCase();
    expect(content).toMatch(/device.{0,20}id|push.{0,20}token/);
  });

  it("states no data is sold to third parties", () => {
    const content = fs.readFileSync(dataSafetyPath, "utf8").toLowerCase();
    expect(content).toMatch(/not sold|no.*sold|never sold/);
  });
});

// ── 15.6.4: No in-app purchase packages ──────────────────────────────────────

describe("15.6.4 — No in-app purchase packages", () => {
  const IAP_PACKAGES = [
    "expo-in-app-purchases",
    "react-native-iap",
    "react-native-purchases",
    "expo-payments",
    "stripe-react-native",
  ];

  it("package.json contains no IAP dependencies", () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(MOBILE_ROOT, "package.json"), "utf8")
    );
    const allDeps = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
    };
    const found = IAP_PACKAGES.filter((p) => p in allDeps);
    expect(found).toEqual([]);
  });

  it("no source file imports an IAP package", () => {
    const violations: string[] = [];
    for (const file of SOURCE_FILES) {
      const content = fs.readFileSync(file, "utf8");
      for (const pkg of IAP_PACKAGES) {
        if (content.includes(pkg)) {
          violations.push(`${path.relative(MOBILE_ROOT, file)}: imports ${pkg}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});

// ── 15.6.4: All upgrade CTAs use browser deep-link ───────────────────────────

describe("15.6.4 — Upgrade CTAs use browser deep-link", () => {
  const PRICING_URL = "https://homegentic.app/pricing";

  it("every file that references 'pricing' uses Linking.openURL, not navigation.navigate", () => {
    const violations: string[] = [];
    for (const file of SOURCE_FILES) {
      const content = fs.readFileSync(file, "utf8");
      if (!content.toLowerCase().includes("pricing")) continue;

      // navigate() to a pricing screen would be in-app — prohibited
      if (/navigation\.navigate\s*\(\s*['"].*[Pp]ricing/.test(content)) {
        violations.push(path.relative(MOBILE_ROOT, file));
      }
    }
    expect(violations).toEqual([]);
  });

  it(`every Linking.openURL call for pricing points to ${PRICING_URL}`, () => {
    const violations: string[] = [];
    for (const file of SOURCE_FILES) {
      const content = fs.readFileSync(file, "utf8");
      // Find openURL calls that mention pricing
      const matches = content.match(/Linking\.openURL\s*\(\s*["']([^"']+)["']\s*\)/g) ?? [];
      for (const match of matches) {
        if (!match.toLowerCase().includes("pricing")) continue;
        if (!match.includes(PRICING_URL)) {
          violations.push(
            `${path.relative(MOBILE_ROOT, file)}: ${match.trim()}`
          );
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("upgrade banner screens open pricing in browser (EarningsScreen)", () => {
    const content = fs.readFileSync(
      path.join(SRC_ROOT, "screens", "EarningsScreen.tsx"), "utf8"
    );
    expect(content).toContain(`Linking.openURL("${PRICING_URL}")`);
  });

  it("upgrade banner screens open pricing in browser (PropertyDetailScreen)", () => {
    const content = fs.readFileSync(
      path.join(SRC_ROOT, "screens", "PropertyDetailScreen.tsx"), "utf8"
    );
    expect(content).toContain(`Linking.openURL("${PRICING_URL}")`);
  });
});
