import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";

// ─── Mock external ICP dependencies ──────────────────────────────────────────

const mockActor = {
  register:                vi.fn(),
  updateProfile:           vi.fn(),
  getMyProfile:            vi.fn(),
  getContractor:           vi.fn(),
  getAll:                  vi.fn(),
  submitReview:            vi.fn(),
  getReviewsForContractor: vi.fn(),
};

vi.mock("@/services/actor", () => ({
  getAgent: vi.fn().mockResolvedValue({}),
}));

vi.mock("@icp-sdk/core/agent", () => ({
  Actor: { createActor: vi.fn(() => mockActor) },
}));

vi.mock("@icp-sdk/core/principal", () => ({
  Principal: { fromText: vi.fn((t: string) => ({ toText: () => t })) },
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRawProfile(overrides: Record<string, unknown> = {}) {
  return {
    id:            { toText: () => "contractor-principal" },
    name:          "Alice Wrench",
    specialties:   [{ HVAC: null }],
    email:         "alice@example.com",
    phone:         "512-555-0100",
    bio:           ["Licensed HVAC tech with 10 years experience"],
    licenseNumber: ["TX-HVAC-12345"],
    serviceArea:   ["Austin, TX"],
    serviceZips:   ["78701", "78702"],
    trustScore:    BigInt(85),
    jobsCompleted: BigInt(42),
    isVerified:    true,
    createdAt:     BigInt(1_700_000_000_000_000_000),
    origin:        { SelfRegistered: null },
    ...overrides,
  };
}

// ─── Load service with a non-empty canister ID so all code paths use the actor.
// CONTRACTOR_CANISTER_ID is a module-level constant evaluated at load time;
// we stub the env var, reset the module cache, then dynamically import the service.

let contractorService: typeof import("@/services/contractor").contractorService;

beforeAll(async () => {
  vi.stubEnv("CONTRACTOR_CANISTER_ID", "aaaaa-aaaaa-aaaaa-aaaaa-cai");
  vi.resetModules();
  contractorService = (await import("@/services/contractor")).contractorService;
});

afterAll(() => {
  vi.unstubAllEnvs();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("contractorService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    contractorService.reset();
  });

  // ── search ───────────────────────────────────────────────────────────────────
  describe("search", () => {
    it("returns all contractors when no specialty filter", async () => {
      mockActor.getAll.mockResolvedValue([makeRawProfile(), makeRawProfile({ name: "Bob Pipes", specialties: [{ Plumbing: null }] })]);
      const results = await contractorService.search();
      expect(results).toHaveLength(2);
    });

    it("filters by specialty when specified", async () => {
      mockActor.getAll.mockResolvedValue([
        makeRawProfile({ specialties: [{ HVAC: null }] }),
        makeRawProfile({ specialties: [{ Plumbing: null }], name: "Bob Pipes" }),
      ]);
      const results = await contractorService.search("HVAC");
      expect(results).toHaveLength(1);
      expect(results[0].specialties).toContain("HVAC");
    });

    it("matches contractor serving multiple trades", async () => {
      mockActor.getAll.mockResolvedValue([
        makeRawProfile({ specialties: [{ HVAC: null }, { Plumbing: null }], name: "Multi" }),
      ]);
      const hvac    = await contractorService.search("HVAC");
      const plumbing = await contractorService.search("Plumbing");
      expect(hvac).toHaveLength(1);
      expect(plumbing).toHaveLength(1);
    });

    it("returns empty array when no contractors match specialty", async () => {
      mockActor.getAll.mockResolvedValue([makeRawProfile({ specialties: [{ HVAC: null }] })]);
      const results = await contractorService.search("Plumbing");
      expect(results).toEqual([]);
    });

    it("returns empty array when canister has no contractors", async () => {
      mockActor.getAll.mockResolvedValue([]);
      const results = await contractorService.search();
      expect(results).toEqual([]);
    });

    it("maps raw profile fields correctly", async () => {
      mockActor.getAll.mockResolvedValue([makeRawProfile()]);
      const [c] = await contractorService.search();
      expect(c.id).toBe("contractor-principal");
      expect(c.name).toBe("Alice Wrench");
      expect(c.specialties).toEqual(["HVAC"]);
      expect(c.email).toBe("alice@example.com");
      expect(c.phone).toBe("512-555-0100");
      expect(c.bio).toBe("Licensed HVAC tech with 10 years experience");
      expect(c.licenseNumber).toBe("TX-HVAC-12345");
      expect(c.serviceArea).toBe("Austin, TX");
      expect(c.serviceZips).toEqual(["78701", "78702"]);
      expect(c.trustScore).toBe(85);
      expect(c.jobsCompleted).toBe(42);
      expect(c.isVerified).toBe(true);
    });

    it("maps optional fields to null when absent", async () => {
      mockActor.getAll.mockResolvedValue([
        makeRawProfile({ bio: [], licenseNumber: [], serviceArea: [] }),
      ]);
      const [c] = await contractorService.search();
      expect(c.bio).toBeNull();
      expect(c.licenseNumber).toBeNull();
      expect(c.serviceArea).toBeNull();
    });

    it("maps serviceZips as empty array when absent", async () => {
      mockActor.getAll.mockResolvedValue([makeRawProfile({ serviceZips: [] })]);
      const [c] = await contractorService.search();
      expect(c.serviceZips).toEqual([]);
    });

    it("maps serviceZips as string array when present", async () => {
      mockActor.getAll.mockResolvedValue([makeRawProfile({ serviceZips: ["78701", "78702", "78703"] })]);
      const [c] = await contractorService.search();
      expect(c.serviceZips).toEqual(["78701", "78702", "78703"]);
    });

    it("maps all sixteen trade variants", async () => {
      const trades = ["Roofing", "HVAC", "Plumbing", "Electrical", "Painting", "Flooring",
                      "Windows", "Landscaping", "Gutters", "GeneralHandyman", "Pest",
                      "Concrete", "Fencing", "Insulation", "Solar", "Pool"];
      for (const s of trades) {
        mockActor.getAll.mockResolvedValue([makeRawProfile({ specialties: [{ [s]: null }] })]);
        const [c] = await contractorService.search();
        expect(c.specialties).toContain(s);
      }
    });
  });

  // ── getTopRated ──────────────────────────────────────────────────────────────
  describe("getTopRated", () => {
    it("returns empty array when no contractors", async () => {
      mockActor.getAll.mockResolvedValue([]);
      const results = await contractorService.getTopRated();
      expect(results).toEqual([]);
    });

    it("sorts contractors by trustScore descending", async () => {
      mockActor.getAll.mockResolvedValue([
        makeRawProfile({ name: "Low",  trustScore: BigInt(30) }),
        makeRawProfile({ name: "High", trustScore: BigInt(95) }),
        makeRawProfile({ name: "Mid",  trustScore: BigInt(60) }),
      ]);
      const results = await contractorService.getTopRated();
      expect(results[0].name).toBe("High");
      expect(results[1].name).toBe("Mid");
      expect(results[2].name).toBe("Low");
    });

    it("handles a single contractor", async () => {
      mockActor.getAll.mockResolvedValue([makeRawProfile()]);
      const results = await contractorService.getTopRated();
      expect(results).toHaveLength(1);
    });

    it("handles ties in trustScore without error", async () => {
      mockActor.getAll.mockResolvedValue([
        makeRawProfile({ name: "A", trustScore: BigInt(70) }),
        makeRawProfile({ name: "B", trustScore: BigInt(70) }),
      ]);
      const results = await contractorService.getTopRated();
      expect(results).toHaveLength(2);
    });

    it("does not mutate the original data ordering", async () => {
      const raw = [
        makeRawProfile({ name: "First",  trustScore: BigInt(20) }),
        makeRawProfile({ name: "Second", trustScore: BigInt(80) }),
      ];
      mockActor.getAll.mockResolvedValue(raw);
      const results = await contractorService.getTopRated();
      expect(results[0].name).toBe("Second"); // sorted
    });
  });

  // ── getMyProfile ─────────────────────────────────────────────────────────────
  describe("getMyProfile", () => {
    it("returns null when canister returns an error", async () => {
      mockActor.getMyProfile.mockResolvedValue({ err: { NotFound: null } });
      const result = await contractorService.getMyProfile();
      expect(result).toBeNull();
    });

    it("returns mapped profile on success", async () => {
      mockActor.getMyProfile.mockResolvedValue({ ok: makeRawProfile() });
      const profile = await contractorService.getMyProfile();
      expect(profile?.name).toBe("Alice Wrench");
      expect(profile?.trustScore).toBe(85);
    });
  });

  // ── getContractor ────────────────────────────────────────────────────────────
  describe("getContractor", () => {
    it("returns null when canister returns an error", async () => {
      mockActor.getContractor.mockResolvedValue({ err: { NotFound: null } });
      const result = await contractorService.getContractor("unknown-principal");
      expect(result).toBeNull();
    });

    it("returns mapped profile on success", async () => {
      mockActor.getContractor.mockResolvedValue({ ok: makeRawProfile() });
      const profile = await contractorService.getContractor("contractor-principal");
      expect(profile?.id).toBe("contractor-principal");
      expect(profile?.name).toBe("Alice Wrench");
    });

    it("converts trustScore from BigInt to number", async () => {
      mockActor.getContractor.mockResolvedValue({ ok: makeRawProfile({ trustScore: BigInt(77) }) });
      const profile = await contractorService.getContractor("p");
      expect(typeof profile?.trustScore).toBe("number");
      expect(profile?.trustScore).toBe(77);
    });

    it("converts jobsCompleted from BigInt to number", async () => {
      mockActor.getContractor.mockResolvedValue({ ok: makeRawProfile({ jobsCompleted: BigInt(33) }) });
      const profile = await contractorService.getContractor("p");
      expect(typeof profile?.jobsCompleted).toBe("number");
      expect(profile?.jobsCompleted).toBe(33);
    });

    it("converts createdAt from nanoseconds to milliseconds", async () => {
      // 1_700_000_000 seconds = 1_700_000_000_000 ms
      const ns = BigInt(1_700_000_000) * BigInt(1_000_000_000);
      mockActor.getContractor.mockResolvedValue({ ok: makeRawProfile({ createdAt: ns }) });
      const profile = await contractorService.getContractor("p");
      expect(profile?.createdAt).toBe(1_700_000_000_000);
    });
  });

  // ── register (canister path — no mock fallback) ──────────────────────────────
  describe("register", () => {
    it("returns mapped profile on success", async () => {
      mockActor.register.mockResolvedValue({ ok: makeRawProfile({ name: "New Contractor" }) });
      const profile = await contractorService.register({
        name: "New Contractor", specialties: ["Roofing"], email: "new@co.com", phone: "555-0001",
      });
      expect(profile.name).toBe("New Contractor");
    });

    it("sends specialties as variant array to canister", async () => {
      mockActor.register.mockResolvedValue({ ok: makeRawProfile() });
      await contractorService.register({
        name: "Multi", specialties: ["HVAC", "Plumbing"], email: "m@m.com", phone: "555-0000",
      });
      const call = mockActor.register.mock.calls[0][0];
      expect(call.specialties).toEqual([{ HVAC: null }, { Plumbing: null }]);
    });

    it("throws on error", async () => {
      mockActor.register.mockResolvedValue({ err: { AlreadyExists: null } });
      await expect(contractorService.register({
        name: "Dup", specialties: ["HVAC"], email: "d@e.com", phone: "555-0002",
      })).rejects.toThrow("AlreadyExists");
    });

    it("throws with InvalidInput text payload", async () => {
      mockActor.register.mockResolvedValue({ err: { InvalidInput: "Name too short" } });
      await expect(contractorService.register({
        name: "x", specialties: ["HVAC"], email: "x@x.com", phone: "555-0003",
      })).rejects.toThrow("Name too short");
    });
  });

  // ── submitReview ──────────────────────────────────────────────────────────────
  describe("submitReview", () => {
    it("resolves without error on success (ok result)", async () => {
      mockActor.submitReview.mockResolvedValue({ ok: null });
      await expect(
        contractorService.submitReview("contractor-principal", 5, "Great work", "job-1")
      ).resolves.toBeUndefined();
    });

    it("throws when canister returns RateLimitExceeded", async () => {
      mockActor.submitReview.mockResolvedValue({ err: { RateLimitExceeded: null } });
      await expect(
        contractorService.submitReview("contractor-principal", 4, "Good", "job-2")
      ).rejects.toThrow("RateLimitExceeded");
    });

    it("throws when canister returns DuplicateReview (composite key dedup)", async () => {
      mockActor.submitReview.mockResolvedValue({ err: { DuplicateReview: null } });
      await expect(
        contractorService.submitReview("contractor-principal", 3, "Dup", "job-3")
      ).rejects.toThrow("DuplicateReview");
    });

    it("throws when canister returns NotFound", async () => {
      mockActor.submitReview.mockResolvedValue({ err: { NotFound: null } });
      await expect(
        contractorService.submitReview("unknown-principal", 5, "?", "job-4")
      ).rejects.toThrow("NotFound");
    });

    it("throws with message text for InvalidInput variant", async () => {
      mockActor.submitReview.mockResolvedValue({ err: { InvalidInput: "Rating must be 1–5" } });
      await expect(
        contractorService.submitReview("contractor-principal", 0, "", "job-5")
      ).rejects.toThrow("Rating must be 1–5");
    });
  });

  // ── updateProfile ─────────────────────────────────────────────────────────────
  describe("updateProfile", () => {
    it("returns updated profile on success", async () => {
      mockActor.updateProfile.mockResolvedValue({ ok: makeRawProfile({ name: "Updated Name" }) });
      const profile = await contractorService.updateProfile({
        name: "Updated Name", specialties: ["Plumbing"], email: "u@u.com", phone: "555-0004",
        bio: "Updated bio", licenseNumber: null, serviceArea: null, serviceZips: [],
      });
      expect(profile.name).toBe("Updated Name");
    });

    it("sends specialties as variant array to canister", async () => {
      mockActor.updateProfile.mockResolvedValue({ ok: makeRawProfile() });
      await contractorService.updateProfile({
        name: "Test", specialties: ["Electrical", "Solar"], email: "t@t.com", phone: "555-0005",
        bio: null, licenseNumber: null, serviceArea: null, serviceZips: [],
      });
      const call = mockActor.updateProfile.mock.calls[0][0];
      expect(call.specialties).toEqual([{ Electrical: null }, { Solar: null }]);
    });

    it("passes null optional fields as empty arrays to canister", async () => {
      mockActor.updateProfile.mockResolvedValue({ ok: makeRawProfile() });
      await contractorService.updateProfile({
        name: "Test", specialties: ["Electrical"], email: "t@t.com", phone: "555-0005",
        bio: null, licenseNumber: null, serviceArea: null, serviceZips: [],
      });
      const call = mockActor.updateProfile.mock.calls[0][0];
      expect(call.bio).toEqual([]);
      expect(call.licenseNumber).toEqual([]);
      expect(call.serviceArea).toEqual([]);
    });

    it("wraps non-null optional fields in arrays for canister", async () => {
      mockActor.updateProfile.mockResolvedValue({ ok: makeRawProfile() });
      await contractorService.updateProfile({
        name: "Test", specialties: ["Electrical"], email: "t@t.com", phone: "555-0005",
        bio: "My bio", licenseNumber: "TX-123", serviceArea: "Austin", serviceZips: ["78701"],
      });
      const call = mockActor.updateProfile.mock.calls[0][0];
      expect(call.bio).toEqual(["My bio"]);
      expect(call.licenseNumber).toEqual(["TX-123"]);
      expect(call.serviceArea).toEqual(["Austin"]);
    });

    it("passes serviceZips array directly to canister", async () => {
      mockActor.updateProfile.mockResolvedValue({ ok: makeRawProfile() });
      await contractorService.updateProfile({
        name: "Test", specialties: ["HVAC"], email: "t@t.com", phone: "555-0005",
        bio: null, licenseNumber: null, serviceArea: null, serviceZips: ["78701", "78702"],
      });
      const call = mockActor.updateProfile.mock.calls[0][0];
      expect(call.serviceZips).toEqual(["78701", "78702"]);
    });

    it("passes empty serviceZips array when contractor serves all areas", async () => {
      mockActor.updateProfile.mockResolvedValue({ ok: makeRawProfile({ serviceZips: [] }) });
      await contractorService.updateProfile({
        name: "Test", specialties: ["HVAC"], email: "t@t.com", phone: "555-0005",
        bio: null, licenseNumber: null, serviceArea: null, serviceZips: [],
      });
      const call = mockActor.updateProfile.mock.calls[0][0];
      expect(call.serviceZips).toEqual([]);
    });
  });
});
