/**
 * SEO — the structured data in index.html must match the real plans.
 *
 * Search engines can show these offers (name and price) in results, so they
 * follow PLANS: Free at $0 and Pro at $59/year, nothing else.
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, it, expect } from "vitest";
import { PLANS } from "@/services/planConstants";

const html = readFileSync(resolve(__dirname, "../../../index.html"), "utf-8");
const block = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
const ld = block ? JSON.parse(block[1]) : null;

describe("index.html JSON-LD", () => {
  it("parses", () => {
    expect(ld?.["@type"]).toBe("SoftwareApplication");
  });

  it("lists exactly the homeowner plans with their real prices", () => {
    const homeowner = PLANS.filter((p) => p.tier === "Free" || p.tier === "Pro");
    const offers = (ld.offers as any[]).map((o) => ({ name: o.name, price: Number(o.price) }));
    expect(offers).toEqual(homeowner.map((p) => ({ name: p.tier, price: p.price })));
  });

  it("states that Pro is billed yearly", () => {
    const pro = (ld.offers as any[]).find((o) => o.name === "Pro");
    expect(pro.priceSpecification).toMatchObject({ price: "59", priceCurrency: "USD", unitCode: "ANN" });
  });

  it("does not use the retired 'blockchain-verified' wording", () => {
    expect(ld.description.toLowerCase()).not.toContain("blockchain");
  });
});
