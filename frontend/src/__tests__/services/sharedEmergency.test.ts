/**
 * #715: the storm and emergency card (packages/shared/src/emergency.ts),
 * shared by the web page and the mobile app's offline copy.
 */
import { describe, it, expect } from "vitest";
import {
  buildEmergencyCard,
  isHurricaneZone,
  isHurricaneSeason,
  isClaimLineRole,
  telHref,
  isWaterEmergency,
  stormPrepKey,
  officialSources,
  PRE_STORM_CHECKLIST,
  AFTER_STORM_STEPS,
  type EmergencyGuide,
} from "@homegentic/shared/emergency";

const guide = (over: Partial<EmergencyGuide> = {}): EmergencyGuide => ({
  waterShutoff: "",
  gasShutoff: "",
  electricPanel: "",
  alarm: "",
  contacts: [],
  photoIds: [],
  ...over,
});

describe("buildEmergencyCard", () => {
  it("lists the three shutoffs in order, with what the guide says about each", () => {
    const card = buildEmergencyCard({
      guide: guide({ waterShutoff: "  Front yard, by the meter  ", gasShutoff: "Left side of the house" }),
      policy: null,
      photos: [],
    });
    expect(card.shutoffs.map((s) => s.key)).toEqual(["water", "gas", "electric"]);
    expect(card.shutoffs[0]).toMatchObject({ label: "Main water shut-off", where: "Front yard, by the meter" });
    expect(card.shutoffs[1].where).toBe("Left side of the house");
    expect(card.shutoffs[2]).toMatchObject({ label: "Electrical panel", where: "" });
  });

  it("puts the onboarding shut-off and panel photos on their rows", () => {
    const card = buildEmergencyCard({
      guide: null,
      policy: null,
      photos: [
        { id: "ph-water", description: "shutoff" },
        { id: "ph-panel", description: "electrical" },
        { id: "ph-roof", description: "roof" },
      ],
    });
    expect(card.shutoffs.find((s) => s.key === "water")?.photoId).toBe("ph-water");
    expect(card.shutoffs.find((s) => s.key === "electric")?.photoId).toBe("ph-panel");
    expect(card.shutoffs.find((s) => s.key === "gas")?.photoId).toBeNull();
    // The roof photo isn't an emergency photo unless the guide picked it.
    expect(card.otherPhotoIds).toEqual([]);
  });

  it("keeps guide photos that aren't already on a row, without repeats", () => {
    const card = buildEmergencyCard({
      guide: guide({ photoIds: ["ph-water", "ph-meter", "ph-meter"] }),
      policy: null,
      photos: [{ id: "ph-water", description: "shutoff" }],
    });
    expect(card.otherPhotoIds).toEqual(["ph-meter"]);
  });

  it("shows the insurer with a claim line taken from the guide's contacts", () => {
    const card = buildEmergencyCard({
      guide: guide({
        contacts: [
          { name: "Ana", role: "Neighbour with the key", phone: "407-555-0101" },
          { name: "Citizens", role: "Insurance claims", phone: "866-411-2742" },
          { name: "Bob's Plumbing", role: "Plumber", phone: "407-555-0199" },
        ],
      }),
      policy: { carrier: " Citizens ", policyNumber: "FL-123" },
      photos: [],
    });
    expect(card.insurer).toEqual({
      carrier: "Citizens",
      policyNumber: "FL-123",
      claimLine: { name: "Citizens", role: "Insurance claims", phone: "866-411-2742" },
    });
    // The claim line isn't listed twice.
    expect(card.contacts.map((c) => c.name)).toEqual(["Ana", "Bob's Plumbing"]);
  });

  it("has no insurer section without a policy, and leaves claim contacts in the list", () => {
    const card = buildEmergencyCard({
      guide: guide({ contacts: [{ name: "Claims", role: "Insurer claim line", phone: "1" }] }),
      policy: null,
      photos: [],
    });
    expect(card.insurer).toBeNull();
    expect(card.contacts).toHaveLength(1);
  });

  it("names what is missing so the owner can fill it in", () => {
    const empty = buildEmergencyCard({ guide: null, policy: null, photos: [] });
    expect(empty.missing).toEqual([
      "Where the main water shut-off is",
      "Where the gas shut-off is",
      "Where the electrical panel is",
      "Your insurance policy",
      "Your insurer's claim line",
      "Emergency contacts",
    ]);
    expect(empty.isEmpty).toBe(true);

    const full = buildEmergencyCard({
      guide: guide({
        waterShutoff: "a",
        gasShutoff: "No gas at this home",
        electricPanel: "c",
        contacts: [
          { name: "Claims", role: "claims", phone: "1" },
          { name: "Plumber", role: "Plumber", phone: "2" },
        ],
      }),
      policy: { carrier: "X", policyNumber: "" },
      photos: [],
    });
    expect(full.missing).toEqual([]);
    expect(full.isEmpty).toBe(false);
  });

  it("counts a shut-off photo alone as knowing where it is", () => {
    const card = buildEmergencyCard({ guide: null, policy: null, photos: [{ id: "p", description: "shutoff" }] });
    expect(card.missing).not.toContain("Where the main water shut-off is");
    expect(card.isEmpty).toBe(false);
  });

  it("carries the alarm notes as typed (trimmed)", () => {
    expect(
      buildEmergencyCard({ guide: guide({ alarm: " ADT, panel by the garage door " }), policy: null, photos: [] })
        .alarm,
    ).toBe("ADT, panel by the garage door");
  });

  it("skips contacts with no name", () => {
    const card = buildEmergencyCard({
      guide: guide({ contacts: [{ name: "  ", role: "x", phone: "1" }] }),
      policy: null,
      photos: [],
    });
    expect(card.contacts).toEqual([]);
  });
});

describe("isClaimLineRole", () => {
  it.each([
    ["Insurance claims", true],
    ["insurer", true],
    ["Claim line", true],
    ["Plumber", false],
    ["", false],
  ])("%s → %s", (role, want) => expect(isClaimLineRole(role)).toBe(want));
});

describe("isHurricaneZone", () => {
  it.each(["FL", "fl", " TX ", "LA", "NC", "HI", "PR", "MA"])("%s is on the hurricane coast", (s) =>
    expect(isHurricaneZone(s)).toBe(true),
  );
  it.each(["CO", "AZ", "MN", "", "Florida"])("%s is not", (s) => expect(isHurricaneZone(s)).toBe(false));
});

describe("isHurricaneSeason", () => {
  it("runs June 1 through November 30", () => {
    expect(isHurricaneSeason(new Date(2026, 4, 31))).toBe(false);
    expect(isHurricaneSeason(new Date(2026, 5, 1))).toBe(true);
    expect(isHurricaneSeason(new Date(2026, 10, 30))).toBe(true);
    expect(isHurricaneSeason(new Date(2026, 11, 1))).toBe(false);
  });
});

describe("telHref", () => {
  it("keeps digits and a leading plus", () => {
    expect(telHref("(407) 555-0101")).toBe("tel:4075550101");
    expect(telHref("+1 866 411 2742 ext 3")).toBe("tel:+18664112742");
  });
  it("is empty when there's nothing to dial", () => {
    expect(telHref("call Ana")).toBe("");
    expect(telHref("")).toBe("");
  });
});

describe("isWaterEmergency", () => {
  it("is true for leak and flood events only", () => {
    expect(isWaterEmergency("WaterLeak")).toBe(true);
    expect(isWaterEmergency("LeakDetected")).toBe(true);
    expect(isWaterEmergency("FloodRisk")).toBe(true);
    expect(isWaterEmergency("HvacAlert")).toBe(false);
  });
});

describe("stormPrepKey", () => {
  it("is per home and per season year, so ticks reset each season", () => {
    expect(stormPrepKey("p1", new Date(2026, 6, 1))).toBe("hg_storm_prep_p1_2026");
    expect(stormPrepKey("p1", new Date(2027, 6, 1))).toBe("hg_storm_prep_p1_2027");
  });
});

describe("officialSources", () => {
  it("always points at the National Hurricane Center and Ready.gov", () => {
    const urls = officialSources("TX").map((s) => s.url);
    expect(urls).toContain("https://www.nhc.noaa.gov/");
    expect(urls).toContain("https://www.ready.gov/hurricanes");
  });
  it("adds Florida's county emergency management list for Florida homes", () => {
    expect(officialSources("fl").map((s) => s.url)).toContain("https://www.floridadisaster.org/counties/");
    expect(officialSources("TX").map((s) => s.url)).not.toContain("https://www.floridadisaster.org/counties/");
  });
});

describe("checklists", () => {
  it("have unique ids and practical steps only", () => {
    for (const list of [PRE_STORM_CHECKLIST, AFTER_STORM_STEPS]) {
      const ids = list.map((i) => i.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const item of list) {
        // Copy limit (#715): no life-safety instructions; that's for local officials.
        expect(item.text).not.toMatch(/evacuat|shelter in place|generator|safe to stay/i);
      }
    }
  });
  it("starts after-storm steps by waiting for officials, then photographing damage", () => {
    expect(AFTER_STORM_STEPS[0].text).toMatch(/local emergency officials/i);
    expect(AFTER_STORM_STEPS[1].text).toMatch(/photo/i);
  });
});
