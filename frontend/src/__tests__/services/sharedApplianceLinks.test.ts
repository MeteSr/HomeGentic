/**
 * Manual and parts links for a saved appliance
 * (packages/shared/src/applianceLinks.ts). No lookup service and no cost: a
 * search for the model's manual, kept to the manufacturer's own site when
 * the brand is one we know, and a parts search.
 *
 *  AL.1 a known brand searches the maker's own site for the model's manual
 *  AL.2 an unknown brand still gets a manual search, without a site limit
 *  AL.3 parts search names brand and model
 *  AL.4 nothing without a model number (a brand alone is too broad)
 */
import { describe, it, expect } from "vitest";
import { applianceLinks, MANUFACTURER_SITES } from "../../../../packages/shared/src/applianceLinks";

const query = (url: string) => new URL(url).searchParams.get("q");

describe("applianceLinks", () => {
  it("AL.1 searches the maker's own site for a known brand, any capitalisation", () => {
    const links = applianceLinks("  RHEEM ", "XE50T10H45U0")!;
    expect(links.manualUrl.startsWith("https://www.google.com/search?")).toBe(true);
    expect(query(links.manualUrl)).toBe("XE50T10H45U0 manual site:rheem.com");
    expect(links.manufacturerSite).toBe("rheem.com");
  });

  it("AL.1 knows the sites of common appliance, HVAC and water-heater brands", () => {
    expect(MANUFACTURER_SITES["ge"]).toBe("geappliances.com");
    expect(applianceLinks("A. O. Smith", "GCR-50")!.manufacturerSite).toBe("hotwater.com");
    expect(applianceLinks("A.O. Smith", "GCR-50")!.manufacturerSite).toBe("hotwater.com");
    expect(applianceLinks("Whirlpool", "WRF555SDFZ")!.manufacturerSite).toBe("whirlpool.com");
  });

  it("AL.2 an unknown brand gets a plain manual search", () => {
    const links = applianceLinks("Acme Heaters", "AH-200")!;
    expect(query(links.manualUrl)).toBe("Acme Heaters AH-200 owner's manual");
    expect(links.manufacturerSite).toBeNull();
  });

  it("AL.3 searches for parts by brand and model", () => {
    expect(query(applianceLinks("Whirlpool", "WRF555SDFZ")!.partsUrl)).toBe("Whirlpool WRF555SDFZ replacement parts");
  });

  it("AL.4 gives nothing without a model number", () => {
    expect(applianceLinks("Rheem", "")).toBeNull();
    expect(applianceLinks("Rheem", "  ")).toBeNull();
    expect(applianceLinks("", "XE50T10H45U0")).not.toBeNull();
  });
});
