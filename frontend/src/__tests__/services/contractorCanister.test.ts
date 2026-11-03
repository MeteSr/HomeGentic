/**
 * contractorService canister paths the older contractor.test.ts doesn't
 * reach (test-gap audit 2026-11-03, M2): profile lookups and their error
 * mapping, the email reveal, privacy, credentials, portfolio, licence
 * checks and admin verification.
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";

const a = {
  getAll: vi.fn(),
  getMyProfile: vi.fn(),
  getContractor: vi.fn(),
  getContractorEmail: vi.fn(),
  updateProfile: vi.fn(),
  getMyProfilePrivacy: vi.fn(),
  setProfilePrivacy: vi.fn(),
  getProfilePrivacies: vi.fn(),
  getCredentials: vi.fn(),
  getBySpecialty: vi.fn(),
  getPortfolio: vi.fn(),
  setPortfolio: vi.fn(),
  getLicenseCheck: vi.fn(),
  verifyContractor: vi.fn(),
  getReviewsForContractor: vi.fn(),
};
vi.mock("@/services/actor", () => ({ getAgent: vi.fn().mockResolvedValue({}) }));
vi.mock("@icp-sdk/core/agent", () => ({ Actor: { createActor: vi.fn(() => a) }, HttpAgent: vi.fn() }));
vi.mock("@icp-sdk/core/principal", () => ({
  Principal: {
    fromText: vi.fn((t: string) => {
      if (t === "not-a-principal") throw new Error("bad principal");
      return { toText: () => t };
    }),
  },
}));
const { mockFetch } = vi.hoisted(() => ({ mockFetch: vi.fn() }));
vi.mock("@/services/voiceAgentHeaders", () => ({ voiceAgentFetch: mockFetch }));

const NS = 1_000_000n;
function rawProfile(id: string, extra: Record<string, unknown> = {}) {
  return {
    id: { toText: () => id },
    name: "Cool Air",
    specialties: [{ HVAC: null }],
    email: "",
    phone: "",
    bio: [],
    licenseNumber: ["CAC1234567"],
    serviceArea: [],
    serviceZips: ["32801"],
    trustScore: 70n,
    jobsCompleted: 4n,
    isVerified: false,
    createdAt: 1_000n * NS,
    origin: { SelfRegistered: null },
    notifyPush: [],
    notifyEmail: [],
    alertZips: [],
    ...extra,
  };
}

let contractorService: typeof import("@/services/contractor").contractorService;
let hasErrorCode: typeof import("@/services/candid").hasErrorCode;

beforeAll(async () => {
  vi.stubEnv("CONTRACTOR_CANISTER_ID", "aaaaa-aaaaa-aaaaa-aaaaa-cai");
  vi.resetModules();
  contractorService = (await import("@/services/contractor")).contractorService;
  ({ hasErrorCode } = await import("@/services/candid"));
});
afterAll(() => vi.unstubAllEnvs());
beforeEach(() => {
  vi.clearAllMocks();
  contractorService.reset();
});

describe("getMyProfile", () => {
  it("returns null when the caller has no profile", async () => {
    a.getMyProfile.mockResolvedValue({ err: { NotFound: null } });
    expect(await contractorService.getMyProfile()).toBeNull();
  });

  it("throws on an outage, so the app doesn't offer to create a second profile", async () => {
    a.getMyProfile.mockResolvedValue({ err: { Paused: null } });
    expect(hasErrorCode(await contractorService.getMyProfile().catch((e) => e), "Paused")).toBe(true);
  });

  it("decodes a guest-signed origin and notification prefs", async () => {
    a.getMyProfile.mockResolvedValue({
      ok: rawProfile("me", { origin: { GuestSigned: "job-9" }, notifyPush: [true], notifyEmail: ["a@b.c"] }),
    });
    expect(await contractorService.getMyProfile()).toMatchObject({
      id: "me",
      origin: { type: "GuestSigned", jobId: "job-9" },
      notifyPush: true,
      notifyEmail: "a@b.c",
      licenseNumber: "CAC1234567",
      bio: null,
    });
  });
});

describe("getContractor", () => {
  it("returns null for text that isn't a principal, without calling the canister", async () => {
    expect(await contractorService.getContractor("not-a-principal")).toBeNull();
    expect(a.getContractor).not.toHaveBeenCalled();
  });

  it("returns null for NotFound and throws on an outage", async () => {
    a.getContractor.mockResolvedValue({ err: { NotFound: null } });
    expect(await contractorService.getContractor("c1")).toBeNull();
    a.getContractor.mockResolvedValue({ err: { Unavailable: "Try later." } });
    expect(hasErrorCode(await contractorService.getContractor("c1").catch((e) => e), "Unavailable")).toBe(true);
  });

  it("fills a blanked email from getContractorEmail when the caller has worked with them", async () => {
    a.getContractor.mockResolvedValue({ ok: rawProfile("c1") });
    a.getContractorEmail.mockResolvedValue({ ok: "hi@coolair.com" });
    expect((await contractorService.getContractor("c1"))?.email).toBe("hi@coolair.com");
  });

  it("leaves the email blank when the reveal is refused or rejects", async () => {
    a.getContractor.mockResolvedValue({ ok: rawProfile("c1") });
    a.getContractorEmail.mockResolvedValue({ err: { NotAuthorized: null } });
    expect((await contractorService.getContractor("c1"))?.email).toBe("");
    a.getContractorEmail.mockRejectedValue(new Error("reject"));
    expect((await contractorService.getContractor("c1"))?.email).toBe("");
  });

  it("doesn't ask for the email when the profile already carries it", async () => {
    a.getContractor.mockResolvedValue({ ok: rawProfile("c1", { email: "x@y.z" }) });
    await contractorService.getContractor("c1");
    expect(a.getContractorEmail).not.toHaveBeenCalled();
  });
});

describe("lists", () => {
  it("search filters by specialty; getTopRated sorts by trust score and swallows failures", async () => {
    a.getAll.mockResolvedValue([
      rawProfile("lo", { trustScore: 10n, specialties: [{ Plumbing: null }] }),
      rawProfile("hi", { trustScore: 90n }),
    ]);
    expect((await contractorService.search("HVAC")).map((c) => c.id)).toEqual(["hi"]);
    expect((await contractorService.getTopRated()).map((c) => c.id)).toEqual(["hi", "lo"]);
    a.getAll.mockRejectedValue(new Error("down"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await contractorService.getTopRated()).toEqual([]);
  });

  it("getBySpecialty sends the service-type variant", async () => {
    a.getBySpecialty.mockResolvedValue([rawProfile("c1")]);
    await contractorService.getBySpecialty("HVAC");
    expect(a.getBySpecialty).toHaveBeenCalledWith({ HVAC: null });
  });
});

describe("privacy", () => {
  it("reads and saves the caller's privacy", async () => {
    a.getMyProfilePrivacy.mockResolvedValue({ listed: true, showTrustScore: false, showJobsCompleted: true });
    a.setProfilePrivacy.mockResolvedValue({ ok: { listed: false, showTrustScore: false, showJobsCompleted: false } });
    expect((await contractorService.getMyProfilePrivacy()).showTrustScore).toBe(false);
    expect(
      (await contractorService.setProfilePrivacy({ listed: false, showTrustScore: false, showJobsCompleted: false }))
        .listed,
    ).toBe(false);
  });

  it("asks for a profile first on NotFound and passes other errors through", async () => {
    a.setProfilePrivacy.mockResolvedValue({ err: { NotFound: null } });
    await expect(
      contractorService.setProfilePrivacy({ listed: true, showTrustScore: true, showJobsCompleted: true }),
    ).rejects.toThrow("Create your contractor profile first");
    a.setProfilePrivacy.mockResolvedValue({ err: { RateLimited: null } });
    const err = await contractorService
      .setProfilePrivacy({ listed: true, showTrustScore: true, showJobsCompleted: true })
      .catch((e) => e);
    expect(hasErrorCode(err, "RateLimited")).toBe(true);
  });

  it("getProfilePrivacies keys results by principal, with defaults for gaps", async () => {
    a.getProfilePrivacies.mockResolvedValue([{ listed: false, showTrustScore: true, showJobsCompleted: true }, null]);
    const out = await contractorService.getProfilePrivacies(["c1", "c2"]);
    expect(out.c1.listed).toBe(false);
    expect(out.c2.listed).toBe(true);
    expect(await contractorService.getProfilePrivacies([])).toEqual({});
  });
});

describe("credentials, portfolio and licence", () => {
  it("getCredentials decodes ids, principals and timestamps", async () => {
    a.getCredentials.mockResolvedValue([
      {
        id: 3n,
        jobId: "j1",
        contractorId: { toText: () => "c1" },
        serviceType: "HVAC",
        verifiedAt: 5_000n * NS,
        homeownerPrincipal: { toText: () => "o1" },
      },
    ]);
    expect((await contractorService.getCredentials("c1"))[0]).toMatchObject({
      id: 3,
      jobId: "j1",
      contractorId: "c1",
      homeownerPrincipal: "o1",
      verifiedAt: 5_000,
    });
  });

  it("setPortfolio sends credential ids as nat and throws the canister error", async () => {
    a.setPortfolio.mockResolvedValue({ err: { NotAuthorized: null } });
    const err = await contractorService
      .setPortfolio("c1", [{ credentialId: 3, caption: "x", photoIds: [] } as any])
      .catch((e) => e);
    expect(a.setPortfolio.mock.calls[0][0][0].credentialId).toBe(3n);
    expect(hasErrorCode(err, "NotAuthorized")).toBe(true);
  });

  it("getLicenseCheck returns null for a bad principal or no check yet", async () => {
    expect(await contractorService.getLicenseCheck("not-a-principal")).toBeNull();
    a.getLicenseCheck.mockResolvedValue([]);
    expect(await contractorService.getLicenseCheck("c1")).toBeNull();
  });

  it("checkMyLicense shows the Worker's error, or a fallback", async () => {
    mockFetch.mockResolvedValue({ ok: false, json: async () => ({ error: "Add a licence number first." }) });
    await expect(contractorService.checkMyLicense("c1")).rejects.toThrow("Add a licence number first.");
    mockFetch.mockResolvedValue({
      ok: false,
      json: async () => {
        throw new Error("not json");
      },
    });
    await expect(contractorService.checkMyLicense("c1")).rejects.toThrow("Couldn't check your licence just now.");
  });

  it("verifyContractor returns the verified profile, or a typed error for non-admins", async () => {
    a.verifyContractor.mockResolvedValue({ ok: rawProfile("c1", { isVerified: true }) });
    expect((await contractorService.verifyContractor("c1")).isVerified).toBe(true);
    a.verifyContractor.mockResolvedValue({ err: { NotAuthorized: null } });
    expect(hasErrorCode(await contractorService.verifyContractor("c1").catch((e) => e), "NotAuthorized")).toBe(true);
  });
});
