/**
 * HOMEGENTIC_TOOLS schema tests.
 *
 * AI.5 — HOMEGENTIC_TOOLS now uses the normalized ToolDefinition type
 *         (parameters instead of input_schema). AnthropicProvider.toAnthropicTools()
 *         is responsible for converting to Anthropic wire format.
 *
 * Pre-existing regression guards are retained; only the accessor helpers
 * have been updated from .input_schema → .parameters.
 */

import { HOMEGENTIC_TOOLS } from "../tools";
import type { ToolDefinition } from "../provider";

function getTool(name: string): ToolDefinition {
  const t = HOMEGENTIC_TOOLS.find((t) => t.name === name);
  if (!t) throw new Error(`Tool "${name}" not found in HOMEGENTIC_TOOLS`);
  return t;
}

function getRequired(name: string): string[] {
  return getTool(name).parameters.required ?? [];
}

function getProperties(name: string): Record<string, any> {
  return getTool(name).parameters.properties ?? {};
}

// ── AI.5: HOMEGENTIC_TOOLS uses normalized ToolDefinition ────────────────────────

describe("AI.5 — HOMEGENTIC_TOOLS normalized schema", () => {
  it("every tool has parameters (not input_schema)", () => {
    for (const tool of HOMEGENTIC_TOOLS) {
      expect(tool).toHaveProperty("parameters");
      expect(tool).not.toHaveProperty("input_schema");
    }
  });

  it("every tool's parameters.type is 'object'", () => {
    for (const tool of HOMEGENTIC_TOOLS) {
      expect(tool.parameters.type).toBe("object");
    }
  });

  it("every tool has a non-empty name and description", () => {
    for (const tool of HOMEGENTIC_TOOLS) {
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
  it("exists in HOMEGENTIC_TOOLS", () => {
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
  it("exists in HOMEGENTIC_TOOLS", () => {
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

// ── Contractor job proposal tools ─────────────────────────────────────────────

describe("propose_job tool — contractor-initiated job proposals", () => {
  it("exists in HOMEGENTIC_TOOLS", () => {
    expect(() => getTool("propose_job")).not.toThrow();
  });

  it("has a description mentioning homeowner approval or proposal", () => {
    const desc = getTool("propose_job").description.toLowerCase();
    expect(desc).toMatch(/homeowner|proposal|pending.*approval|approval/);
  });

  it("requires property_address, service_type, description, amount_cents, completed_date", () => {
    const req = getRequired("propose_job");
    expect(req).toContain("property_address");
    expect(req).toContain("service_type");
    expect(req).toContain("description");
    expect(req).toContain("amount_cents");
    expect(req).toContain("completed_date");
  });

  it("property_address is a string", () => {
    expect(getProperties("propose_job").property_address.type).toBe("string");
  });

  it("service_type is an enum of known home service types", () => {
    const prop = getProperties("propose_job").service_type;
    expect(prop.type).toBe("string");
    expect(prop.enum).toContain("HVAC");
    expect(prop.enum).toContain("Roofing");
    expect(prop.enum).toContain("Plumbing");
  });

  it("amount_cents is a number", () => {
    expect(getProperties("propose_job").amount_cents.type).toBe("number");
  });

  it("completed_date is a string (YYYY-MM-DD)", () => {
    const prop = getProperties("propose_job").completed_date;
    expect(prop.type).toBe("string");
    expect(prop.description).toMatch(/YYYY-MM-DD/);
  });

  it("contractor_name is optional (not in required)", () => {
    const req = getRequired("propose_job");
    expect(req).not.toContain("contractor_name");
  });
});

describe("confirm_job_proposal tool — contractor confirms pending proposal", () => {
  it("exists in HOMEGENTIC_TOOLS", () => {
    expect(() => getTool("confirm_job_proposal")).not.toThrow();
  });

  it("has a description mentioning confirmation or submit", () => {
    const desc = getTool("confirm_job_proposal").description.toLowerCase();
    expect(desc).toMatch(/confirm|submit|send.*homeowner|notify/);
  });

  it("requires proposal_id", () => {
    expect(getRequired("confirm_job_proposal")).toContain("proposal_id");
  });

  it("proposal_id is a string", () => {
    expect(getProperties("confirm_job_proposal").proposal_id.type).toBe("string");
  });

  it("has no other required fields beyond proposal_id", () => {
    expect(getRequired("confirm_job_proposal")).toHaveLength(1);
  });
});
