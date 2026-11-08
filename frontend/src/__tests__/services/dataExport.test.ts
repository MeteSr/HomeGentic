import { describe, it, expect, vi, beforeEach } from "vitest";

const state = vi.hoisted(() => ({ failBills: false }));

vi.mock("@/services/auth", () => ({
  authService: { getProfile: async () => ({ principal: "p-1", email: "o@example.com" }) },
}));
vi.mock("@/services/payment", () => ({
  paymentService: { getMySubscription: async () => ({ tier: "Pro", expiresAt: 1, cancelledAt: null }) },
}));
vi.mock("@/services/property", () => ({
  propertyService: {
    getMyProperties: async () => [{ id: 7n, address: "12 Elm St" }],
    getOwnershipHistory: async () => [{ from: "a", to: "b" }],
  },
}));
vi.mock("@/services/job", () => ({ jobService: { getByProperty: async () => [{ id: "JOB_1", amount: 12000n }] } }));
vi.mock("@/services/photo", () => ({
  photoService: {
    getByProperty: async () => [
      {
        id: "PHOTO_1",
        jobId: "inventory_I1",
        propertyId: "7",
        phase: "After",
        description: "",
        hash: "h",
        url: "blob:one",
        size: 3,
        verified: true,
        createdAt: 0,
      },
      {
        id: "PHOTO_2",
        jobId: "claim_C1",
        propertyId: "7",
        phase: "After",
        description: "",
        hash: "h2",
        url: "blob:gone",
        size: 3,
        verified: true,
        createdAt: 0,
      },
    ],
  },
}));
vi.mock("@/services/insurancePolicy", () => ({
  insurancePolicyService: { get: async () => ({ carrier: "Citizens", renewalDate: "2027-06-01" }) },
}));
vi.mock("@/services/insuranceClaims", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/insuranceClaims")>()),
  insuranceClaimService: { list: async () => [{ id: "C1", title: "Leak", log: [] }] },
}));
vi.mock("@/services/inventory", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/inventory")>()),
  inventoryService: { list: async () => [{ id: "I1", name: "65-inch TV", valueCents: 129900 }] },
}));
vi.mock("@/services/houseGuide", () => ({
  houseGuideService: { get: async () => ({ wifiName: "Lake House", contacts: [], photoIds: [] }) },
}));
vi.mock("@/services/moveInPlan", () => ({
  moveInPlanService: { get: async () => ({ startedAt: 1, doneSteps: ["locks"], tasks: [], updatedAt: 1 }) },
}));
vi.mock("@/services/succession", () => ({
  successionService: {
    getSuccessor: async () => ({ name: "Jordan Rivera", email: "jordan@example.com", relationship: "", token: "t", namedAt: 1 }),
    getMyClaims: async () => [{ id: "sc-1", status: { tag: "AwaitingReview" } }],
  },
}));
vi.mock("@/services/hoaRecords", () => ({
  hoaService: {
    listReviews: async () => [{ id: "R1", project: "Fence" }],
    listAssessments: async () => [{ id: "A1", title: "Roof", amount: 4500 }],
    getCondo: async () => null,
  },
}));
vi.mock("@/services/room", () => ({ roomService: { getRoomsByProperty: async () => [] } }));
vi.mock("@/services/maintenance", () => ({ maintenanceService: { getScheduleByProperty: async () => [] } }));
vi.mock("@/services/sensor", () => ({
  sensorService: { getDevicesForProperty: async () => [], getEventsForProperty: async () => [] },
}));
vi.mock("@/services/billService", () => ({
  billService: {
    getBillsForProperty: async () => {
      if (state.failBills) throw new Error("bills canister paused");
      return [{ id: "B1" }];
    },
    getRecurringExpensesForProperty: async () => [],
  },
}));
vi.mock("@/services/recurringService", () => ({ recurringService: { getByProperty: async () => [] } }));
vi.mock("@/services/report", () => ({ reportService: { listShareLinks: async () => [{ token: "t" }] } }));
vi.mock("@/services/quote", () => ({
  quoteService: { getRequests: async () => [{ id: "Q1" }], getMyBids: async () => [] },
}));
vi.mock("@/services/listing", () => ({
  listingService: { getMyBidRequests: async () => [], getMyProposals: async () => [] },
}));
vi.mock("@/services/contractor", () => ({ contractorService: { getMyProfile: async () => null } }));
vi.mock("@/services/agent", () => ({ agentService: { getMyProfile: async () => null } }));
vi.mock("@/services/notificationPrefs", () => ({
  notificationsConfigured: () => false,
  getNotificationPrefs: async () => ({}),
}));

import { buildExportZip, collectMyData } from "@/services/dataExport";

// jsdom's Blob can't go through undici's Response, so answer with the shape the export reads.
const fakeFetch = (async (url: string) =>
  url === "blob:one"
    ? {
        ok: true,
        status: 200,
        blob: async () => ({ type: "image/jpeg", arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer }),
      }
    : { ok: false, status: 404 }) as unknown as typeof fetch;

/** Reads the stored (uncompressed) entries back out of the archive. */
function unzip(zip: Uint8Array): Map<string, Uint8Array> {
  const out = new Map<string, Uint8Array>();
  const v = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  let at = 0;
  while (v.getUint32(at, true) === 0x04034b50) {
    const size = v.getUint32(at + 18, true);
    const nameLen = v.getUint16(at + 26, true);
    const name = new TextDecoder().decode(zip.subarray(at + 30, at + 30 + nameLen));
    out.set(name, zip.subarray(at + 30 + nameLen, at + 30 + nameLen + size));
    at += 30 + nameLen + size;
  }
  return out;
}

beforeEach(() => {
  state.failBills = false;
});

describe("data export", () => {
  it("covers the account and every home, with photo files named in data.json", async () => {
    const { zip, failed } = await buildExportZip(undefined, fakeFetch);
    const files = unzip(zip);
    expect([...files.keys()]).toEqual(["data.json", "README.txt", "photos/7/PHOTO_1.jpg"]);
    expect([...files.get("photos/7/PHOTO_1.jpg")!]).toEqual([1, 2, 3]);
    const data = JSON.parse(new TextDecoder().decode(files.get("data.json")));
    expect(Object.keys(data.account)).toEqual([
      "profile",
      "subscription",
      "quoteRequests",
      "quotesSubmitted",
      "listingBidRequests",
      "listingProposals",
      "contractorProfile",
      "agentProfile",
      "successorClaims",
    ]);
    const home = data.properties.ok[0];
    expect(home.property).toEqual({ id: "7", address: "12 Elm St" });
    expect(Object.keys(home.sections).sort()).toEqual([
      "architecturalReviews",
      "bills",
      "condoAssociation",
      "houseGuide",
      "insuranceClaims",
      "insurancePolicy",
      "inventory",
      "jobs",
      "maintenanceSchedule",
      "moveInPlan",
      "ownershipHistory",
      "photos",
      "recurringExpenses",
      "recurringServices",
      "reportShareLinks",
      "rooms",
      "smartHomeDevices",
      "smartHomeEvents",
      "specialAssessments",
      "successor",
    ]);
    expect(home.sections.jobs.ok[0].amount).toBe("12000");
    expect(home.sections.photos.ok.map((p: any) => [p.id, p.file, p.url])).toEqual([
      ["PHOTO_1", "photos/7/PHOTO_1.jpg", undefined],
      ["PHOTO_2", null, undefined],
    ]);
    expect(home.sections.insurancePolicy.ok.carrier).toBe("Citizens");
    // #725 and #726: the house guide and HOA paperwork.
    expect(home.sections.houseGuide.ok.wifiName).toBe("Lake House");
    expect(home.sections.architecturalReviews.ok[0].project).toBe("Fence");
    expect(home.sections.specialAssessments.ok[0].amount).toBe(4500);
    expect(home.sections.condoAssociation.ok).toBeNull();
    // #712: the move-in plan.
    expect(home.sections.moveInPlan.ok.doneSteps).toEqual(["locks"]);
    // #724: the successor the owner named, and claims the user sent.
    expect(home.sections.successor.ok.name).toBe("Jordan Rivera");
    expect(data.account.successorClaims.ok[0].id).toBe("sc-1");
    expect(home.sections.insuranceClaims.ok[0].id).toBe("C1");
    // Claim damage photos are marked with the claim they were taken for.
    expect(home.sections.photos.ok.map((p: any) => p.insuranceClaimId)).toEqual([undefined, "C1"]);
    // Inventory photos and receipts are marked with their item.
    expect(home.sections.inventory.ok[0].name).toBe("65-inch TV");
    expect(home.sections.photos.ok.map((p: any) => p.inventoryItemId)).toEqual(["I1", undefined]);
    expect(failed).toEqual(["photo PHOTO_2"]);
    expect(new TextDecoder().decode(files.get("README.txt"))).toContain(
      "could not be read and are missing: photo PHOTO_2",
    );
  });

  it("records a section that fails instead of failing the export", async () => {
    state.failBills = true;
    const { data } = await collectMyData();
    expect(data.properties).toHaveProperty("ok");
    const s = (data.properties as any).ok[0].sections;
    expect(s.bills).toEqual({ error: "bills canister paused" });
    expect(s.jobs).toHaveProperty("ok");
    expect(data.failed).toEqual(["bills (12 Elm St)"]);
  });
});
