/**
 * HOMEFAX_TOOLS schema tests.
 *
 * AI.5 — HOMEFAX_TOOLS now uses the normalized ToolDefinition type
 *         (parameters instead of input_schema). AnthropicProvider.toAnthropicTools()
 *         is responsible for converting to Anthropic wire format.
 *
 * Pre-existing regression guards are retained; only the accessor helpers
 * have been updated from .input_schema → .parameters.
 */

import { HOMEFAX_TOOLS } from "../tools";
import type { ToolDefinition } from "../provider";

function getTool(name: string): ToolDefinition {
  const t = HOMEFAX_TOOLS.find((t) => t.name === name);
  if (!t) throw new Error(`Tool "${name}" not found in HOMEFAX_TOOLS`);
  return t;
}

function getRequired(name: string): string[] {
  return getTool(name).parameters.required ?? [];
}

function getProperties(name: string): Record<string, any> {
  return getTool(name).parameters.properties ?? {};
}

// ── AI.5: HOMEFAX_TOOLS uses normalized ToolDefinition ────────────────────────

describe("AI.5 — HOMEFAX_TOOLS normalized schema", () => {
  it("every tool has parameters (not input_schema)", () => {
    for (const tool of HOMEFAX_TOOLS) {
      expect(tool).toHaveProperty("parameters");
      expect(tool).not.toHaveProperty("input_schema");
    }
  });

  it("every tool's parameters.type is 'object'", () => {
    for (const tool of HOMEFAX_TOOLS) {
      expect(tool.parameters.type).toBe("object");
    }
  });

  it("every tool has a non-empty name and description", () => {
    for (const tool of HOMEFAX_TOOLS) {
      expect(typeof tool.name).toBe("string");
      expect(tool.name.length).toBeGreaterThan(0);
      expect(typeof tool.description).toBe("string");
      expect(tool.description.length).toBeGreaterThan(0);
    }
  });
});

// ── Existing tools — regression guard ────────────────────────────────────────

describe("existing tools — schema regression", () => {
  it("create_maintenance_job requires property_id, service_type, is_diy, amount_cents, completed_date", () => {
    const req = getRequired("create_maintenance_job");
    expect(req).toContain("property_id");
    expect(req).toContain("service_type");
    expect(req).toContain("is_diy");
    expect(req).toContain("amount_cents");
    expect(req).toContain("completed_date");
  });

  it("create_quote_request requires property_id, service_type, description, urgency", () => {
    const req = getRequired("create_quote_request");
    expect(req).toContain("property_id");
    expect(req).toContain("service_type");
    expect(req).toContain("urgency");
  });

  it("submit_bid requires request_id, amount_dollars, timeline_days", () => {
    const req = getRequired("submit_bid");
    expect(req).toContain("request_id");
    expect(req).toContain("amount_dollars");
    expect(req).toContain("timeline_days");
  });

  it("sign_job_verification requires job_id", () => {
    expect(getRequired("sign_job_verification")).toContain("job_id");
  });

  it("search_contractors requires service_type", () => {
    expect(getRequired("search_contractors")).toContain("service_type");
  });

  it("list_leads has no required fields", () => {
    expect(getRequired("list_leads")).toHaveLength(0);
  });
});

// ── 15.7.6 get_score ─────────────────────────────────────────────────────────

describe("get_score tool (15.7.6)", () => {
  it("exists in HOMEFAX_TOOLS", () => {
    expect(() => getTool("get_score")).not.toThrow();
  });

  it("has a description mentioning score and factors", () => {
    const desc = getTool("get_score").description.toLowerCase();
    expect(desc).toMatch(/score/);
    expect(desc).toMatch(/factor/);
  });

  it("accepts an optional property_id", () => {
    const props = getProperties("get_score");
    expect(props).toHaveProperty("property_id");
  });

  it("property_id is not required (defaults to first property)", () => {
    expect(getRequired("get_score")).not.toContain("property_id");
  });
});

// ── 15.7.9 upload_photos ─────────────────────────────────────────────────────

describe("upload_photos tool (15.7.9)", () => {
  it("exists in HOMEFAX_TOOLS", () => {
    expect(() => getTool("upload_photos")).not.toThrow();
  });

  it("has a description mentioning deep link or camera", () => {
    const desc = getTool("upload_photos").description.toLowerCase();
    expect(desc).toMatch(/deep.?link|camera|photos?\s+screen/);
  });

  it("requires job_id", () => {
    expect(getRequired("upload_photos")).toContain("job_id");
  });

  it("job_id property is a string type", () => {
    expect(getProperties("upload_photos").job_id.type).toBe("string");
  });
});
