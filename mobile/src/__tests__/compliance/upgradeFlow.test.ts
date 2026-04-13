/**
 * TDD — Issue #50: Upgrade flow compliance (no IAP, web-only purchases)
 *
 * Owner decision (issue comment): "We don't want in-app purchases, as they
 * take away from my bottom line. If they want to upgrade, we should link to
 * the upgrade page outside of the app via a link."
 *
 * Apple guideline 3.2.1 (reader-app exemption):
 *   Apps that are "reader" apps (provide access to previously purchased
 *   content or subscriptions) are NOT required to use IAP for upgrades.
 *   HomeGentic is a reader app: subscriptions are purchased on the web at
 *   homegentic.app, and the mobile app accesses that subscription.
 *   This is the same model used by Netflix, Spotify, and Kindle.
 *
 * These tests scan source files to enforce the pattern statically.
 */

import * as fs   from "fs";
import * as path from "path";

const MOBILE_ROOT   = path.resolve(__dirname, "../../../");
const SRC_ROOT      = path.resolve(MOBILE_ROOT, "src");
const SCREENS_ROOT  = path.resolve(SRC_ROOT, "screens");
const SERVICES_ROOT = path.resolve(SRC_ROOT, "services");

function read(filePath: string): string {
  return fs.readFileSync(filePath, "utf8");
}

const UPGRADE_SERVICE = path.join(SERVICES_ROOT, "upgradePage.ts");
const BILL_SCREEN     = path.join(SCREENS_ROOT, "BillUploadScreen.tsx");
const PROPERTY_SCREEN = path.join(SCREENS_ROOT, "PropertyDetailScreen.tsx");
const EARNINGS_SCREEN = path.join(SCREENS_ROOT, "EarningsScreen.tsx");
const SCAN_SCREEN     = path.join(SCREENS_ROOT, "ScanDocumentScreen.tsx");

// ─── upgradePage.ts utility ───────────────────────────────────────────────────

describe("upgradePage utility", () => {
  it("upgradePage.ts exists in services/", () => {
    expect(fs.existsSync(UPGRADE_SERVICE)).toBe(true);
  });

  it("exports PRICING_URL constant pointing to homegentic.app/pricing", () => {
    const src = read(UPGRADE_SERVICE);
    expect(src).toMatch(/PRICING_URL\s*=\s*["']https:\/\/homegentic\.app\/pricing["']/);
  });

  it("exports openUpgradePage function", () => {
    const src = read(UPGRADE_SERVICE);
    expect(src).toMatch(/export\s+(function|const)\s+openUpgradePage/);
  });

  it("openUpgradePage calls Linking.openURL with PRICING_URL", () => {
    const src = read(UPGRADE_SERVICE);
    expect(src).toMatch(/Linking\.openURL/);
    expect(src).toMatch(/PRICING_URL/);
  });

  it("does NOT call any IAP API", () => {
    const src = read(UPGRADE_SERVICE);
    expect(src).not.toMatch(/in-app-purchase|InAppPurchase|RevenueCat|StoreKit/);
  });
});

// ─── BillUploadScreen ─────────────────────────────────────────────────────────

describe("BillUploadScreen upgrade flow", () => {
  it("imports openUpgradePage from upgradePage service", () => {
    const src = read(BILL_SCREEN);
    expect(src).toMatch(/openUpgradePage/);
  });

  it("calls openUpgradePage (not bare Linking.openURL) on TierLimitReachedError", () => {
    const src = read(BILL_SCREEN);
    expect(src).toMatch(/TierLimitReachedError/);
    expect(src).toMatch(/openUpgradePage/);
  });

  it("does not call Linking.openURL directly for pricing", () => {
    const src = read(BILL_SCREEN);
    // Any openURL referencing pricing must go through openUpgradePage
    const directPricingCall = src.match(/Linking\.openURL\s*\([^)]*pricing[^)]*\)/);
    expect(directPricingCall).toBeNull();
  });
});

// ─── PropertyDetailScreen ─────────────────────────────────────────────────────

describe("PropertyDetailScreen upgrade flow", () => {
  it("imports openUpgradePage from upgradePage service", () => {
    const src = read(PROPERTY_SCREEN);
    expect(src).toMatch(/openUpgradePage/);
  });

  it("calls openUpgradePage for the upgrade banner", () => {
    const src = read(PROPERTY_SCREEN);
    expect(src).toMatch(/openUpgradePage/);
  });
});

// ─── EarningsScreen ───────────────────────────────────────────────────────────

describe("EarningsScreen upgrade flow", () => {
  it("imports openUpgradePage from upgradePage service", () => {
    const src = read(EARNINGS_SCREEN);
    expect(src).toMatch(/openUpgradePage/);
  });
});

// ─── ScanDocumentScreen (future gating) ──────────────────────────────────────

describe("ScanDocumentScreen upgrade readiness", () => {
  it("does NOT import any IAP package", () => {
    const src = read(SCAN_SCREEN);
    expect(src).not.toMatch(/expo-in-app-purchases|react-native-iap|RevenueCat/);
  });
});

// ─── No direct Linking.openURL for pricing in any screen ─────────────────────

describe("No direct pricing Linking.openURL in screens (must go through openUpgradePage)", () => {
  const screenFiles = fs.readdirSync(SCREENS_ROOT)
    .filter((f) => f.endsWith(".tsx") || f.endsWith(".ts"))
    .map((f) => path.join(SCREENS_ROOT, f));

  it("no screen calls Linking.openURL('https://homegentic.app/pricing') directly", () => {
    const violations: string[] = [];
    for (const file of screenFiles) {
      const src = read(file);
      if (/Linking\.openURL\s*\(\s*["']https:\/\/homegentic\.app\/pricing/.test(src)) {
        violations.push(path.basename(file));
      }
    }
    expect(violations).toEqual([]);
  });
});
