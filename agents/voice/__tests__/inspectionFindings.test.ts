/**
 * @jest-environment node
 *
 * #712 move-in plan: POST /api/inspection-findings reads the problems a home
 * inspector wrote up in a purchase inspection report, for the new owner to
 * review before any become tasks. Pure helpers only (no model call here; the
 * route's gate is covered by workerAiRoutes.test.ts).
 *
 *  IF.1 normalizeFindings keeps well-formed findings, trimmed and capped
 *  IF.2 it maps urgency words to safety / repair / monitor (default repair)
 *  IF.3 it drops findings with no title and duplicate titles, and caps the list
 *  IF.4 it reads a non-object or missing list as no findings
 *  IF.5 the prompt asks only for what the report says, and never for a verdict
 *  IF.6 the route is registered and gated like every other AI route
 */
import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { resolve } from "path";
import { normalizeFindings, buildInspectionPrompt, MAX_FINDINGS } from "../src/inspectionFindings";

describe("normalizeFindings", () => {
  it("IF.1 keeps well-formed findings, trimmed and capped in length", () => {
    const out = normalizeFindings({
      findings: [
        {
          title: "  GFCI outlet by kitchen sink does not trip  ",
          detail: " Replace the outlet. ",
          area: " Electrical ",
          urgency: "safety",
          page: 12,
        },
        { title: "x".repeat(300), detail: "y".repeat(900), area: "z".repeat(80), urgency: "repair" },
      ],
      reportDate: "2026-10-02",
    });
    expect(out.findings[0]).toEqual({
      title: "GFCI outlet by kitchen sink does not trip",
      detail: "Replace the outlet.",
      area: "Electrical",
      urgency: "safety",
    });
    expect(out.findings[1].title).toHaveLength(120);
    expect(out.findings[1].detail).toHaveLength(500);
    expect(out.findings[1].area).toHaveLength(40);
  });

  it("IF.2 maps urgency to safety, repair or monitor", () => {
    const urg = (u: unknown) => normalizeFindings({ findings: [{ title: "T", urgency: u }] }).findings[0].urgency;
    expect(urg("Safety")).toBe("safety");
    expect(urg("SAFETY HAZARD")).toBe("safety");
    expect(urg("monitor")).toBe("monitor");
    expect(urg("Maintenance / monitor")).toBe("monitor");
    expect(urg("repair")).toBe("repair");
    expect(urg("deferred")).toBe("repair");
    expect(urg(undefined)).toBe("repair");
  });

  it("IF.3 drops untitled and duplicate findings and caps the list", () => {
    const out = normalizeFindings({
      findings: [
        { title: "" },
        { title: "   " },
        { detail: "no title" },
        "a string",
        null,
        { title: "Roof flashing loose" },
        { title: "roof flashing loose " },
        ...Array.from({ length: 40 }, (_, i) => ({ title: `Finding ${i}` })),
      ],
    });
    expect(out.findings[0].title).toBe("Roof flashing loose");
    expect(out.findings.filter((f) => f.title.toLowerCase() === "roof flashing loose")).toHaveLength(1);
    expect(out.findings).toHaveLength(MAX_FINDINGS);
    expect(MAX_FINDINGS).toBe(25);
  });

  it("IF.4 reads anything without a list as no findings", () => {
    expect(normalizeFindings(null).findings).toEqual([]);
    expect(normalizeFindings("nope").findings).toEqual([]);
    expect(normalizeFindings({ ok: true }).findings).toEqual([]);
    expect(normalizeFindings({ findings: "x" }).findings).toEqual([]);
  });

  it("IF.4b says whether the file looked like an inspection report", () => {
    expect(normalizeFindings({ isInspectionReport: false, findings: [] }).isInspectionReport).toBe(false);
    expect(normalizeFindings({ findings: [{ title: "T" }] }).isInspectionReport).toBe(true);
  });
});

describe("buildInspectionPrompt", () => {
  it("IF.5 asks only for what the report says, never for a verdict", () => {
    const p = buildInspectionPrompt();
    expect(p).toMatch(/only/i);
    expect(p).toMatch(/written in the report/i);
    expect(p).toMatch(/"findings"/);
    expect(p).toMatch(/safety\|repair\|monitor/);
    expect(p).toMatch(/do not invent/i);
    expect(p).not.toMatch(/code[- ]compliant|is safe|passed inspection/i);
  });
});

describe("/api/inspection-findings route", () => {
  const SRC = readFileSync(resolve(__dirname, "../src/index.ts"), "utf8");
  it("IF.6 is registered and listed in AUX_AI_ROUTES", () => {
    expect(SRC).toContain('path === "/api/inspection-findings"');
    const aux = SRC.match(/const AUX_AI_ROUTES = new Set\(\[([\s\S]*?)\]\)/)?.[1] ?? "";
    expect(aux).toContain('"/api/inspection-findings"');
  });
});
