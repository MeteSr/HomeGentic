import { describe, it, expect, beforeEach } from "vitest";
import { systemAgesService, TRACKED_SYSTEMS } from "@/services/systemAges";

// jsdom provides localStorage; clear it before each test for isolation
beforeEach(() => {
  localStorage.clear();
});

// ─── get ──────────────────────────────────────────────────────────────────────

describe("systemAgesService.get", () => {
  it("returns empty object when nothing stored", () => {
    expect(systemAgesService.get("prop-1")).toEqual({});
  });

  it("returns stored ages for a property", () => {
    localStorage.setItem("homegentic_system_ages_prop-1", JSON.stringify({ HVAC: 2018 }));
    expect(systemAgesService.get("prop-1")).toEqual({ HVAC: 2018 });
  });

  it("is keyed per property — different IDs don't bleed", () => {
    localStorage.setItem("homegentic_system_ages_prop-1", JSON.stringify({ HVAC: 2018 }));
    localStorage.setItem("homegentic_system_ages_prop-2", JSON.stringify({ Roofing: 2015 }));

    expect(systemAgesService.get("prop-1")).toEqual({ HVAC: 2018 });
    expect(systemAgesService.get("prop-2")).toEqual({ Roofing: 2015 });
  });

  it("returns empty object when stored value is malformed JSON", () => {
    localStorage.setItem("homegentic_system_ages_prop-1", "not-json{{");
    expect(systemAgesService.get("prop-1")).toEqual({});
  });

  it("returns all systems when multiple are stored", () => {
    const ages = { HVAC: 2018, Roofing: 2010, "Water Heater": 2020 };
    localStorage.setItem("homegentic_system_ages_prop-1", JSON.stringify(ages));
    expect(systemAgesService.get("prop-1")).toEqual(ages);
  });
});

// ─── set ──────────────────────────────────────────────────────────────────────

describe("systemAgesService.set", () => {
  it("persists ages to localStorage", () => {
    systemAgesService.set("prop-1", { HVAC: 2019 });
    const raw = localStorage.getItem("homegentic_system_ages_prop-1");
    expect(JSON.parse(raw!)).toEqual({ HVAC: 2019 });
  });

  it("overwrites previous value entirely", () => {
    systemAgesService.set("prop-1", { HVAC: 2019, Roofing: 2010 });
    systemAgesService.set("prop-1", { HVAC: 2022 });
    expect(systemAgesService.get("prop-1")).toEqual({ HVAC: 2022 });
  });

  it("round-trips through get correctly", () => {
    const ages = { HVAC: 2018, Windows: 2021, Flooring: 2023 };
    systemAgesService.set("prop-1", ages);
    expect(systemAgesService.get("prop-1")).toEqual(ages);
  });

  it("stores empty object when passed empty ages", () => {
    systemAgesService.set("prop-1", {});
    expect(systemAgesService.get("prop-1")).toEqual({});
  });

  it("does not affect other properties", () => {
    systemAgesService.set("prop-1", { HVAC: 2018 });
    systemAgesService.set("prop-2", { Roofing: 2015 });
    expect(systemAgesService.get("prop-1")).toEqual({ HVAC: 2018 });
  });
});

// ─── hasAny ───────────────────────────────────────────────────────────────────

describe("systemAgesService.hasAny", () => {
  it("returns false when nothing is stored", () => {
    expect(systemAgesService.hasAny("prop-1")).toBe(false);
  });

  it("returns false when empty object is stored", () => {
    systemAgesService.set("prop-1", {});
    expect(systemAgesService.hasAny("prop-1")).toBe(false);
  });

  it("returns true when at least one system is set", () => {
    systemAgesService.set("prop-1", { HVAC: 2020 });
    expect(systemAgesService.hasAny("prop-1")).toBe(true);
  });

  it("returns true when multiple systems are set", () => {
    systemAgesService.set("prop-1", { HVAC: 2020, Roofing: 2015, Windows: 2018 });
    expect(systemAgesService.hasAny("prop-1")).toBe(true);
  });

  it("is independent per property", () => {
    systemAgesService.set("prop-1", { HVAC: 2020 });
    expect(systemAgesService.hasAny("prop-1")).toBe(true);
    expect(systemAgesService.hasAny("prop-2")).toBe(false);
  });
});

// ─── TRACKED_SYSTEMS constant ─────────────────────────────────────────────────

describe("TRACKED_SYSTEMS", () => {
  it("contains exactly 9 systems", () => {
    expect(TRACKED_SYSTEMS).toHaveLength(9);
  });

  it("matches the system names used by predictMaintenance", () => {
    const expected = [
      "HVAC",
      "Roofing",
      "Water Heater",
      "Windows",
      "Electrical",
      "Plumbing",
      "Flooring",
      "Insulation",
      "Solar Panels",
    ];
    expect([...TRACKED_SYSTEMS]).toEqual(expected);
  });
});
