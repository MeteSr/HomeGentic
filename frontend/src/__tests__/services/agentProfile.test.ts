import { describe, it, expect, beforeEach } from "vitest";
import { agentProfileService } from "@/services/agentProfile";
import type { AgentProfile } from "@/services/agentProfile";

// ─── Fixture ──────────────────────────────────────────────────────────────────

const FULL_PROFILE: AgentProfile = {
  name:      "Jane Smith",
  brokerage: "Acme Realty",
  phone:     "512-555-0100",
  logoUrl:   "https://example.com/logo.png",
};

// ─── save / load / clear ──────────────────────────────────────────────────────

describe("save / load / clear", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns null when nothing saved", () => {
    expect(agentProfileService.load()).toBeNull();
  });

  it("round-trips a full profile", () => {
    agentProfileService.save(FULL_PROFILE);
    expect(agentProfileService.load()).toEqual(FULL_PROFILE);
  });

  it("overwrites an existing profile", () => {
    agentProfileService.save(FULL_PROFILE);
    const updated = { ...FULL_PROFILE, name: "Bob Jones" };
    agentProfileService.save(updated);
    expect(agentProfileService.load()?.name).toBe("Bob Jones");
  });

  it("clear() removes the stored profile", () => {
    agentProfileService.save(FULL_PROFILE);
    agentProfileService.clear();
    expect(agentProfileService.load()).toBeNull();
  });

  it("load() returns null if localStorage contains invalid JSON", () => {
    localStorage.setItem("homegentic_agent_profile", "not-json{{{");
    expect(agentProfileService.load()).toBeNull();
  });
});

// ─── appendToUrl ──────────────────────────────────────────────────────────────

describe("appendToUrl", () => {
  it("appends all non-empty fields as query params", () => {
    const result = agentProfileService.appendToUrl(
      "http://localhost/report/abc",
      FULL_PROFILE
    );
    const u = new URL(result);
    expect(u.searchParams.get("an")).toBe("Jane Smith");
    expect(u.searchParams.get("ab")).toBe("Acme Realty");
    expect(u.searchParams.get("aph")).toBe("512-555-0100");
    expect(u.searchParams.get("al")).toBe("https://example.com/logo.png");
  });

  it("omits empty fields", () => {
    const partial: AgentProfile = {
      name:      "Jane Smith",
      brokerage: "",
      phone:     "",
      logoUrl:   "",
    };
    const result = agentProfileService.appendToUrl(
      "http://localhost/report/abc",
      partial
    );
    const u = new URL(result);
    expect(u.searchParams.has("ab")).toBe(false);
    expect(u.searchParams.has("aph")).toBe(false);
    expect(u.searchParams.has("al")).toBe(false);
    expect(u.searchParams.get("an")).toBe("Jane Smith");
  });

  it("preserves existing query params on the URL", () => {
    const result = agentProfileService.appendToUrl(
      "http://localhost/report/abc?token=xyz",
      FULL_PROFILE
    );
    const u = new URL(result);
    expect(u.searchParams.get("token")).toBe("xyz");
    expect(u.searchParams.get("an")).toBe("Jane Smith");
  });

  it("omits all params when every field is empty", () => {
    const empty: AgentProfile = { name: "", brokerage: "", phone: "", logoUrl: "" };
    const result = agentProfileService.appendToUrl(
      "http://localhost/report/abc",
      empty
    );
    const u = new URL(result);
    expect([...u.searchParams.keys()]).toHaveLength(0);
  });
});

// ─── fromParams ───────────────────────────────────────────────────────────────

describe("fromParams", () => {
  it("returns null when 'an' param is missing", () => {
    const p = new URLSearchParams("ab=Acme&aph=512-555-0100");
    expect(agentProfileService.fromParams(p)).toBeNull();
  });

  it("parses all four fields", () => {
    const p = new URLSearchParams(
      "an=Jane+Smith&ab=Acme+Realty&aph=512-555-0100&al=https%3A%2F%2Fexample.com%2Flogo.png"
    );
    expect(agentProfileService.fromParams(p)).toEqual(FULL_PROFILE);
  });

  it("returns empty strings for missing optional fields", () => {
    const p = new URLSearchParams("an=Jane+Smith");
    const result = agentProfileService.fromParams(p)!;
    expect(result.brokerage).toBe("");
    expect(result.phone).toBe("");
    expect(result.logoUrl).toBe("");
  });

  it("appendToUrl → fromParams round-trip", () => {
    const appended = agentProfileService.appendToUrl(
      "http://localhost/report/abc",
      FULL_PROFILE
    );
    const u = new URL(appended);
    const decoded = agentProfileService.fromParams(u.searchParams);
    expect(decoded).toEqual(FULL_PROFILE);
  });
});
