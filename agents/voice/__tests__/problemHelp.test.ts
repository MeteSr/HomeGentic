/**
 * @jest-environment node
 *
 * "Show me the problem": POST /api/problem-help takes the owner's description
 * of something wrong at home (and an optional photo) and returns an AI
 * suggestion: likely causes, what's safe to try, what to shut off, whether to
 * get out and call for help, and which trade to ask. Pure helpers only (no
 * model call here; the route's gate is covered by workerAiRoutes.test.ts).
 *
 *  PH.1 normalizeProblemHelp keeps well-formed answers, trimmed and capped
 *  PH.2 it maps the trade to a quote service type, or Other
 *  PH.3 it maps urgency to the quote form's levels (default medium)
 *  PH.4 a danger answer is always urgent and keeps its advice
 *  PH.5 it reads junk as an empty, non-danger answer
 *  PH.6 the prompt hedges, puts safety first and never claims a diagnosis
 *  PH.7 problemHelpInputError checks the description and the optional photo
 *  PH.8 the route is registered and gated like every other AI route
 */
import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  normalizeProblemHelp,
  buildProblemHelpPrompt,
  problemHelpInputError,
  MAX_DESCRIPTION_CHARS,
} from "../src/problemHelp";

describe("normalizeProblemHelp", () => {
  it("PH.1 keeps well-formed answers, trimmed and capped", () => {
    const out = normalizeProblemHelp({
      summary: "  Water pooling under the water heater.  ",
      likelyCauses: [" A leaking drain valve ", "", "x".repeat(400), "a", "b", "c"],
      safeToTry: ["Tighten the drain valve by hand", 7],
      shutOff: ["Cold-water supply valve on top of the tank"],
      danger: false,
      dangerAdvice: "",
      trade: "Plumbing",
      urgency: "high",
      extra: "ignored",
    });
    expect(out.summary).toBe("Water pooling under the water heater.");
    expect(out.likelyCauses[0]).toBe("A leaking drain valve");
    expect(out.likelyCauses[1]).toHaveLength(200);
    expect(out.likelyCauses).toHaveLength(4);
    expect(out.safeToTry).toEqual(["Tighten the drain valve by hand"]);
    expect(out.shutOff).toEqual(["Cold-water supply valve on top of the tank"]);
    expect(out).toMatchObject({ danger: false, dangerAdvice: "", serviceType: "Plumbing", urgency: "high" });
    expect(out).not.toHaveProperty("extra");
  });

  it("PH.2 maps the trade to a quote service type, or Other", () => {
    const trade = (t: unknown) => normalizeProblemHelp({ trade: t }).serviceType;
    expect(trade("hvac")).toBe("HVAC");
    expect(trade("General Handyman")).toBe("General Handyman");
    expect(trade("GeneralHandyman")).toBe("General Handyman");
    expect(trade("Pest")).toBe("Pest Control");
    expect(trade("Appliance repair")).toBe("Other");
    expect(trade(undefined)).toBe("Other");
  });

  it("PH.3 maps urgency to emergency, high, medium or low", () => {
    const urg = (u: unknown) => normalizeProblemHelp({ urgency: u }).urgency;
    expect(urg("Emergency")).toBe("emergency");
    expect(urg("high")).toBe("high");
    expect(urg("low")).toBe("low");
    expect(urg("whenever")).toBe("medium");
    expect(urg(undefined)).toBe("medium");
  });

  it("PH.4 a danger answer is always an emergency and keeps its advice", () => {
    const out = normalizeProblemHelp({
      danger: true,
      dangerAdvice: "Leave the house now and call the gas company from outside.",
      urgency: "low",
    });
    expect(out.danger).toBe(true);
    expect(out.urgency).toBe("emergency");
    expect(out.dangerAdvice).toContain("Leave the house");
    // Danger with no advice still tells the owner what to do.
    expect(normalizeProblemHelp({ danger: true }).dangerAdvice).toMatch(/911/);
  });

  it("PH.5 reads junk as an empty, non-danger answer", () => {
    for (const raw of [null, "nope", 3, [], { likelyCauses: "one" }]) {
      expect(normalizeProblemHelp(raw)).toEqual({
        summary: "",
        likelyCauses: [],
        safeToTry: [],
        shutOff: [],
        danger: false,
        dangerAdvice: "",
        serviceType: "Other",
        urgency: "medium",
      });
    }
  });
});

describe("buildProblemHelpPrompt", () => {
  const p = buildProblemHelpPrompt();
  it("PH.6 hedges, puts safety first, and never claims a diagnosis", () => {
    expect(p).toMatch(/"likelyCauses"/);
    expect(p).toMatch(/"danger"/);
    expect(p).toMatch(/gas/i);
    expect(p).toMatch(/911/);
    expect(p).toMatch(/licensed/i);
    expect(p).toMatch(/not a diagnosis|never say you are sure/i);
    expect(p).toMatch(/emergency\|high\|medium\|low/);
    expect(p).toContain("Pest Control");
    expect(p).not.toMatch(/you are a (licensed|certified)/i);
  });
});

describe("problemHelpInputError", () => {
  it("PH.7 needs a description and takes only an image as the photo", () => {
    expect(problemHelpInputError({ description: "Water under the sink" })).toBeNull();
    expect(problemHelpInputError({ description: "  " })).toMatch(/describe/i);
    expect(problemHelpInputError({})).toMatch(/describe/i);
    expect(problemHelpInputError({ description: "x".repeat(MAX_DESCRIPTION_CHARS + 1) })).toMatch(/shorter/i);
    expect(problemHelpInputError({ description: "Leak", mimeType: "image/jpeg", base64Data: "aGk=" })).toBeNull();
    expect(problemHelpInputError({ description: "Leak", mimeType: "application/pdf", base64Data: "aGk=" })).toMatch(
      /photo/i,
    );
    expect(problemHelpInputError({ description: "Leak", mimeType: "image/png" })).toMatch(/photo/i);
  });
});

describe("/api/problem-help route", () => {
  const SRC = readFileSync(resolve(__dirname, "../src/index.ts"), "utf8");
  it("PH.8 is registered and listed in AUX_AI_ROUTES", () => {
    expect(SRC).toContain('path === "/api/problem-help"');
    const aux = SRC.match(/const AUX_AI_ROUTES = new Set\(\[([\s\S]*?)\]\)/)?.[1] ?? "";
    expect(aux).toContain('"/api/problem-help"');
  });
});
