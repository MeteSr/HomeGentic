/**
 * Unit tests — agentTools.ts (12.1.6)
 *
 * Covers every tool execution path in executeTool() plus error recovery
 * and the toolActionLabel() helper.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Service mocks ────────────────────────────────────────────────────────────

vi.mock("@/services/job", () => ({
  jobService: {
    create:          vi.fn(),
    verifyJob:       vi.fn(),
    updateJobStatus: vi.fn(),
  },
}));

vi.mock("@/services/quote", () => ({
  quoteService: {
    createRequest: vi.fn(),
  },
}));

vi.mock("@/services/contractor", () => ({
  contractorService: {
    search: vi.fn(),
  },
}));

vi.mock("@/services/maintenance", () => ({
  maintenanceService: {
    createScheduleEntry: vi.fn(),
  },
}));

import { executeTool, toolActionLabel, type ToolName } from "@/services/agentTools";
import { jobService }          from "@/services/job";
import { quoteService }        from "@/services/quote";
import { contractorService }   from "@/services/contractor";
import { maintenanceService }  from "@/services/maintenance";

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const mockJob = {
  id: "job-1", propertyId: "prop-1", serviceType: "Roof",
  description: "Replaced shingles", amount: 80000, date: "2024-06-01",
  status: "completed" as const, verified: false,
  homeownerSigned: true, contractorSigned: false,
  isDiy: false, contractorName: "Apex Roofing",
  permitNumber: undefined, warrantyMonths: undefined,
  photos: [], homeowner: "owner", contractor: undefined, createdAt: 0,
};

const mockRequest = {
  id: "req-1", propertyId: "prop-1", homeowner: "owner-principal",
  serviceType: "HVAC", description: "AC replacement", urgency: "high" as const,
  status: "open" as const, createdAt: 0,
};

const mockContractor = {
  id: "c-1", name: "CoolAir LLC", trustScore: 88,
  jobsCompleted: 42, isVerified: true, serviceArea: "Austin, TX",
  serviceZips: [] as string[],
  specialties: ["HVAC"], licenseNumber: null, rating: 4.8,
  bio: null, phone: "", email: "", createdAt: 0,
  origin: { type: "SelfRegistered" as const },
};

const mockScheduleEntry = {
  id: "sch-1", propertyId: "prop-1", systemName: "HVAC",
  taskDescription: "Annual filter change", plannedYear: 2025,
  plannedMonth: 3, estimatedCostCents: 5000,
  isCompleted: false, createdAt: 0,
};

beforeEach(() => vi.clearAllMocks());

// ──────────────────────────────────────────────────────────────────────────────
// classify_home_issue
// ──────────────────────────────────────────────────────────────────────────────

describe("executeTool — classify_home_issue", () => {
  it("returns success with action, serviceType, urgency, and summary", async () => {
    const result = await executeTool("classify_home_issue", {
      action: "log_job", service_type: "Roof", urgency: "low",
      reasoning: "Shingles already replaced.",
    });
    expect(result.success).toBe(true);
    expect(result.data?.action).toBe("log_job");
    expect(result.data?.serviceType).toBe("Roof");
    expect(result.data?.urgency).toBe("low");
    expect(String(result.data?.summary)).toMatch(/log a completed job/i);
  });

  it("maps action=emergency_quote to correct label", async () => {
    const result = await executeTool("classify_home_issue", {
      action: "emergency_quote", service_type: "Plumbing", urgency: "emergency",
      reasoning: "Burst pipe.",
    });
    expect(String(result.data?.summary)).toMatch(/emergency quote request/i);
  });

  it("maps action=quote_request to correct label", async () => {
    const result = await executeTool("classify_home_issue", {
      action: "quote_request", service_type: "Electrical", urgency: "medium",
      reasoning: "Outlets flickering.",
    });
    expect(String(result.data?.summary)).toMatch(/open a quote request/i);
  });

  it("does not call any canister service (pure reasoning)", async () => {
    await executeTool("classify_home_issue", {
      action: "log_job", service_type: "Paint", urgency: "low", reasoning: "",
    });
    expect(vi.mocked(jobService.create)).not.toHaveBeenCalled();
    expect(vi.mocked(quoteService.createRequest)).not.toHaveBeenCalled();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// create_maintenance_job
// ──────────────────────────────────────────────────────────────────────────────

describe("executeTool — create_maintenance_job", () => {
  beforeEach(() => {
    vi.mocked(jobService.create).mockResolvedValue(mockJob);
  });

  it("calls jobService.create with mapped fields", async () => {
    await executeTool("create_maintenance_job", {
      property_id: "prop-1", service_type: "Roof", description: "Replaced shingles",
      contractor_name: "Apex Roofing", amount_cents: 80000,
      completed_date: "2024-06-01", is_diy: false,
    });
    expect(vi.mocked(jobService.create)).toHaveBeenCalledWith(
      expect.objectContaining({
        propertyId: "prop-1",
        serviceType: "Roof",
        description: "Replaced shingles",
        contractorName: "Apex Roofing",
        amount: 80000,
      })
    );
  });

  it("returns jobId and a summary string", async () => {
    const result = await executeTool("create_maintenance_job", {
      property_id: "prop-1", service_type: "Roof", description: "Replaced shingles",
      contractor_name: "Apex Roofing", amount_cents: 80000,
      completed_date: "2024-06-01", is_diy: false,
    });
    expect(result.success).toBe(true);
    expect(result.data?.jobId).toBe("job-1");
    expect(String(result.data?.summary)).toMatch(/Roof/);
  });

  it("omits contractorName for DIY jobs", async () => {
    await executeTool("create_maintenance_job", {
      property_id: "prop-1", service_type: "Paint", description: "Repainted garage",
      amount_cents: 20000, completed_date: "2024-05-01", is_diy: true,
    });
    expect(vi.mocked(jobService.create)).toHaveBeenCalledWith(
      expect.objectContaining({ contractorName: undefined, isDiy: true })
    );
  });

  it("includes permit and warranty in summary when provided", async () => {
    const result = await executeTool("create_maintenance_job", {
      property_id: "prop-1", service_type: "Roof", description: "desc",
      contractor_name: "Apex", amount_cents: 80000, completed_date: "2024-06-01",
      is_diy: false, permit_number: "P-123", warranty_months: 24,
    });
    expect(String(result.data?.summary)).toMatch(/P-123/);
    expect(String(result.data?.summary)).toMatch(/24-month warranty/);
  });

  it("returns success:false when jobService.create throws", async () => {
    vi.mocked(jobService.create).mockRejectedValue(new Error("Canister unavailable"));
    const result = await executeTool("create_maintenance_job", {
      property_id: "p", service_type: "HVAC", description: "d",
      amount_cents: 1000, completed_date: "2024-01-01", is_diy: false,
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Canister unavailable/);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// create_quote_request
// ──────────────────────────────────────────────────────────────────────────────

describe("executeTool — create_quote_request", () => {
  beforeEach(() => {
    vi.mocked(quoteService.createRequest).mockResolvedValue(mockRequest);
  });

  it("calls quoteService.createRequest with mapped fields", async () => {
    await executeTool("create_quote_request", {
      property_id: "prop-1", service_type: "HVAC",
      description: "AC replacement needed", urgency: "HIGH",
    });
    expect(vi.mocked(quoteService.createRequest)).toHaveBeenCalledWith(
      expect.objectContaining({
        propertyId: "prop-1",
        serviceType: "HVAC",
        urgency: "high",
      })
    );
  });

  it("lower-cases urgency before passing to service", async () => {
    await executeTool("create_quote_request", {
      property_id: "p", service_type: "Plumbing", description: "d", urgency: "EMERGENCY",
    });
    expect(vi.mocked(quoteService.createRequest)).toHaveBeenCalledWith(
      expect.objectContaining({ urgency: "emergency" })
    );
  });

  it("returns requestId and summary", async () => {
    const result = await executeTool("create_quote_request", {
      property_id: "prop-1", service_type: "HVAC", description: "AC", urgency: "high",
    });
    expect(result.success).toBe(true);
    expect(result.data?.requestId).toBe("req-1");
    expect(String(result.data?.summary)).toMatch(/HVAC/);
  });

  it("returns success:false when quoteService.createRequest throws", async () => {
    vi.mocked(quoteService.createRequest).mockRejectedValue(new Error("Tier limit reached"));
    const result = await executeTool("create_quote_request", {
      property_id: "p", service_type: "HVAC", description: "d", urgency: "low",
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Tier limit reached/);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// draft_work_order
// ──────────────────────────────────────────────────────────────────────────────

describe("executeTool — draft_work_order", () => {
  it("returns a formatted work order string", async () => {
    const result = await executeTool("draft_work_order", {
      service_type: "Roof",
      scope_of_work: "Replace all shingles on south-facing slope",
      questions_for_contractor: "What is your warranty?",
    });
    expect(result.success).toBe(true);
    expect(String(result.data?.workOrder)).toMatch(/WORK ORDER — ROOF/);
    expect(String(result.data?.workOrder)).toMatch(/Replace all shingles/);
    expect(String(result.data?.workOrder)).toMatch(/What is your warranty/);
  });

  it("includes materials section when provided", async () => {
    const result = await executeTool("draft_work_order", {
      service_type: "Roof", scope_of_work: "Replace shingles",
      materials_or_specs: "30-year architectural shingles",
      questions_for_contractor: "Timeline?",
    });
    expect(String(result.data?.workOrder)).toMatch(/MATERIALS/);
    expect(String(result.data?.workOrder)).toMatch(/30-year architectural/);
  });

  it("includes access notes when provided", async () => {
    const result = await executeTool("draft_work_order", {
      service_type: "Roof", scope_of_work: "Repair flashing",
      access_notes: "Gate code is 1234", questions_for_contractor: "ETA?",
    });
    expect(String(result.data?.workOrder)).toMatch(/ACCESS/);
    expect(String(result.data?.workOrder)).toMatch(/1234/);
  });

  it("does not call any canister service (pure output)", async () => {
    await executeTool("draft_work_order", {
      service_type: "Electrical", scope_of_work: "Panel upgrade",
      questions_for_contractor: "Licensed?",
    });
    expect(vi.mocked(jobService.create)).not.toHaveBeenCalled();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// search_contractors
// ──────────────────────────────────────────────────────────────────────────────

describe("executeTool — search_contractors", () => {
  it("returns top-3 contractors sorted by trustScore descending", async () => {
    const contractors = [
      { ...mockContractor, id: "c-1", trustScore: 70 },
      { ...mockContractor, id: "c-2", trustScore: 90 },
      { ...mockContractor, id: "c-3", trustScore: 80 },
      { ...mockContractor, id: "c-4", trustScore: 60 },
    ];
    vi.mocked(contractorService.search).mockResolvedValue(contractors);
    const result = await executeTool("search_contractors", { service_type: "HVAC" });
    expect(result.success).toBe(true);
    const returned = result.data?.contractors as Array<{ id: string }>;
    expect(returned).toHaveLength(3);
    expect(returned[0].id).toBe("c-2"); // highest score first
  });

  it("returns found=0 and a helpful message when no contractors exist", async () => {
    vi.mocked(contractorService.search).mockResolvedValue([]);
    const result = await executeTool("search_contractors", { service_type: "Solar" });
    expect(result.success).toBe(true);
    expect(result.data?.found).toBe(0);
    expect(String(result.data?.summary)).toMatch(/No contractors found/i);
  });

  it("summary includes contractor names and trust scores", async () => {
    vi.mocked(contractorService.search).mockResolvedValue([mockContractor]);
    const result = await executeTool("search_contractors", { service_type: "HVAC" });
    expect(String(result.data?.summary)).toMatch(/CoolAir LLC/);
    expect(String(result.data?.summary)).toMatch(/88/);
  });

  it("returns success:false when contractorService.search throws", async () => {
    vi.mocked(contractorService.search).mockRejectedValue(new Error("Network error"));
    const result = await executeTool("search_contractors", { service_type: "HVAC" });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Network error/);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// sign_job_verification
// ──────────────────────────────────────────────────────────────────────────────

describe("executeTool — sign_job_verification", () => {
  it("returns fully verified status when both parties have signed", async () => {
    vi.mocked(jobService.verifyJob).mockResolvedValue({ ...mockJob, status: "verified", verified: true });
    const result = await executeTool("sign_job_verification", { job_id: "job-1" });
    expect(result.success).toBe(true);
    expect(result.data?.status).toBe("verified");
    expect(String(result.data?.summary)).toMatch(/fully verified on-chain/i);
  });

  it("returns awaiting co-signature message when only homeowner has signed", async () => {
    vi.mocked(jobService.verifyJob).mockResolvedValue({ ...mockJob, status: "completed" });
    const result = await executeTool("sign_job_verification", { job_id: "job-1" });
    expect(String(result.data?.summary)).toMatch(/awaiting contractor co-signature/i);
  });

  it("passes jobId through to the result", async () => {
    vi.mocked(jobService.verifyJob).mockResolvedValue({ ...mockJob, status: "verified" });
    const result = await executeTool("sign_job_verification", { job_id: "job-99" });
    expect(result.data?.jobId).toBe("job-99");
  });

  it("returns success:false when verifyJob throws", async () => {
    vi.mocked(jobService.verifyJob).mockRejectedValue(new Error("Job not found"));
    const result = await executeTool("sign_job_verification", { job_id: "bad-id" });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Job not found/);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// update_job_status
// ──────────────────────────────────────────────────────────────────────────────

describe("executeTool — update_job_status", () => {
  it("calls updateJobStatus with lower-cased status", async () => {
    vi.mocked(jobService.updateJobStatus).mockResolvedValue({ ...mockJob, status: "in_progress" });
    await executeTool("update_job_status", { job_id: "job-1", status: "IN_PROGRESS" });
    expect(vi.mocked(jobService.updateJobStatus)).toHaveBeenCalledWith("job-1", "in_progress");
  });

  it("returns updated status in result data", async () => {
    vi.mocked(jobService.updateJobStatus).mockResolvedValue({ ...mockJob, status: "completed" });
    const result = await executeTool("update_job_status", { job_id: "job-1", status: "completed" });
    expect(result.success).toBe(true);
    expect(result.data?.status).toBe("completed");
    expect(String(result.data?.summary)).toMatch(/job-1.*completed/i);
  });

  it("returns success:false when updateJobStatus throws", async () => {
    vi.mocked(jobService.updateJobStatus).mockRejectedValue(new Error("Unauthorized"));
    const result = await executeTool("update_job_status", { job_id: "j", status: "completed" });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Unauthorized/);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// schedule_maintenance_task
// ──────────────────────────────────────────────────────────────────────────────

describe("executeTool — schedule_maintenance_task", () => {
  beforeEach(() => {
    vi.mocked(maintenanceService.createScheduleEntry).mockResolvedValue(mockScheduleEntry);
  });

  it("calls createScheduleEntry with mapped fields", async () => {
    await executeTool("schedule_maintenance_task", {
      property_id: "prop-1", system_name: "HVAC",
      task_description: "Annual filter change", planned_year: 2025,
      planned_month: 3, estimated_cost_dollars: 50,
    });
    expect(vi.mocked(maintenanceService.createScheduleEntry)).toHaveBeenCalledWith(
      "prop-1", "HVAC", "Annual filter change", 2025, 3, 5000
    );
  });

  it("passes undefined for optional fields when omitted", async () => {
    await executeTool("schedule_maintenance_task", {
      property_id: "prop-1", system_name: "Roof",
      task_description: "Inspect flashing", planned_year: 2026,
    });
    expect(vi.mocked(maintenanceService.createScheduleEntry)).toHaveBeenCalledWith(
      "prop-1", "Roof", "Inspect flashing", 2026, undefined, undefined
    );
  });

  it("converts estimated_cost_dollars to cents (×100 rounded)", async () => {
    await executeTool("schedule_maintenance_task", {
      property_id: "p", system_name: "HVAC", task_description: "t",
      planned_year: 2025, estimated_cost_dollars: 49.99,
    });
    expect(vi.mocked(maintenanceService.createScheduleEntry))
      .toHaveBeenCalledWith("p", "HVAC", "t", 2025, undefined, 4999);
  });

  it("returns entryId and summary", async () => {
    const result = await executeTool("schedule_maintenance_task", {
      property_id: "prop-1", system_name: "HVAC",
      task_description: "Annual filter change", planned_year: 2025, planned_month: 3,
    });
    expect(result.success).toBe(true);
    expect(result.data?.entryId).toBe("sch-1");
    expect(String(result.data?.summary)).toMatch(/HVAC/);
    expect(String(result.data?.summary)).toMatch(/2025/);
  });

  it("returns success:false when createScheduleEntry throws", async () => {
    vi.mocked(maintenanceService.createScheduleEntry).mockRejectedValue(new Error("Not found"));
    const result = await executeTool("schedule_maintenance_task", {
      property_id: "p", system_name: "HVAC", task_description: "t", planned_year: 2025,
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Not found/);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Unknown tool + generic error recovery
// ──────────────────────────────────────────────────────────────────────────────

describe("executeTool — unknown tool", () => {
  it("returns success:false with an 'Unknown tool' message", async () => {
    const result = await executeTool("nonexistent_tool" as ToolName, {});
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Unknown tool/i);
  });
});

describe("executeTool — non-Error thrown inside tool", () => {
  it("returns a generic error string when a non-Error is thrown", async () => {
    vi.mocked(jobService.verifyJob).mockRejectedValue("string rejection");
    const result = await executeTool("sign_job_verification", { job_id: "j" });
    expect(result.success).toBe(false);
    expect(result.error).toBe("Tool execution failed");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// toolActionLabel
// ──────────────────────────────────────────────────────────────────────────────

describe("toolActionLabel", () => {
  it("returns a human-readable label for every known tool", () => {
    const tools: ToolName[] = [
      "classify_home_issue", "create_maintenance_job", "create_quote_request",
      "draft_work_order", "search_contractors", "sign_job_verification",
      "update_job_status", "schedule_maintenance_task",
    ];
    for (const t of tools) {
      const label = toolActionLabel(t);
      expect(typeof label).toBe("string");
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it("falls back to the tool name for unknown tools", () => {
    expect(toolActionLabel("unknown_tool" as ToolName)).toBe("unknown_tool");
  });
});
