/**
 * get_home_checkup: read-only answers the app already works out on its own
 * pages, handed to the assistant for one home.
 *
 *  HC.1 documents: the vault's file names, kinds and dates (never contents or
 *       links), newest first, filterable by kind, read without file bytes
 *  HC.2 inspection_readiness: Florida 4-point and wind mitigation checklists
 *       from the home's jobs; other states are told it doesn't apply
 *  HC.3 reserve: the monthly set-aside from the forecast, with its caveat
 *  HC.4 recalls: possible CPSC matches for appliances with a brand and model
 *  HC.5 only the user's own homes, known checks, and failed reads are reported
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/services/property", () => ({ propertyService: { getMyProperties: vi.fn() } }));
vi.mock("@/services/job", () => ({ jobService: { getByProperty: vi.fn() } }));
vi.mock("@/services/photo", () => ({ photoService: { listByJob: vi.fn() } }));
vi.mock("@/services/room", () => ({ roomService: { getRoomsByProperty: vi.fn() } }));
vi.mock("@/services/recalls", async (orig) => ({
  ...(await orig<typeof import("@/services/recalls")>()),
  checkRecalls: vi.fn(),
}));
vi.mock("@/services/systemAges", async (orig) => ({
  ...(await orig<typeof import("@/services/systemAges")>()),
  systemAgesService: { get: vi.fn(() => ({})) },
}));

import { getHomeCheckup, HOME_CHECKS } from "@/services/homeCheckups";
import { propertyService } from "@/services/property";
import { jobService, type Job } from "@/services/job";
import { photoService } from "@/services/photo";
import { roomService } from "@/services/room";
import { checkRecalls } from "@/services/recalls";
import { systemAgesService } from "@/services/systemAges";

const HOME = {
  id: "home-1",
  address: "12 Oak St",
  city: "Orlando",
  state: "FL",
  zipCode: "32801",
  yearBuilt: 1998n,
  squareFeet: 1600n,
};
const job = (over: Partial<Job>): Job =>
  ({
    id: "j1",
    propertyId: "home-1",
    serviceType: "Roofing",
    description: "Full reroof",
    contractorName: "Top Roof",
    amount: 1_500_000,
    date: "2020-05-01",
    status: "verified",
    isDiy: false,
    permitNumber: "BLD-1",
    ...over,
  }) as Job;
const meta = (id: string, description: string, createdAt: number) => ({
  id,
  description,
  createdAt,
  jobId: "docs_home-1",
  propertyId: "home-1",
  size: 10,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(propertyService.getMyProperties).mockResolvedValue([HOME] as any);
  vi.mocked(jobService.getByProperty).mockResolvedValue([]);
  vi.mocked(photoService.listByJob).mockResolvedValue([]);
  vi.mocked(roomService.getRoomsByProperty).mockResolvedValue([]);
  vi.mocked(systemAgesService.get).mockReturnValue({});
});

describe("HC.1 documents", () => {
  beforeEach(() => {
    vi.mocked(photoService.listByJob).mockImplementation(async (jobId: string) =>
      jobId === "docs_home-1"
        ? ([
            meta("d1", "[Warranty] roof-warranty.pdf", Date.UTC(2024, 0, 5)),
            meta("d2", "[Permit] BLD-1|City of Orlando|Closed|permit.pdf", Date.UTC(2025, 2, 1)),
          ] as any)
        : ([meta("d0", "old-receipt.jpg", Date.UTC(2022, 5, 1))] as any),
    );
  });

  it("lists names, kinds and dates from both vault folders, newest first", async () => {
    const r = await getHomeCheckup({ check: "documents", property_id: "home-1" });
    expect(r.success).toBe(true);
    expect(photoService.listByJob).toHaveBeenCalledWith("docs_home-1");
    expect(photoService.listByJob).toHaveBeenCalledWith("receipts_home-1");
    const d = r.data as any;
    expect(d.total).toBe(3);
    expect(d.byKind).toEqual({ Permit: 1, Warranty: 1, Receipt: 1 });
    expect(d.documents).toEqual([
      { name: "permit.pdf", kind: "Permit", added: "2025-03-01", permitNumber: "BLD-1", status: "Closed" },
      { name: "roof-warranty.pdf", kind: "Warranty", added: "2024-01-05" },
      { name: "old-receipt.jpg", kind: "Receipt", added: "2022-06-01" },
    ]);
    expect(d.path).toBe("/properties/home-1?tab=documents");
    expect(d.note).toMatch(/names.*not what the files say/i);
    expect(JSON.stringify(d)).not.toMatch(/https?:|blob:/);
  });

  it("filters by kind", async () => {
    const r = await getHomeCheckup({ check: "documents", property_id: "home-1", doc_type: "Warranty" });
    const d = r.data as any;
    expect(d.documents.map((x: any) => x.name)).toEqual(["roof-warranty.pdf"]);
    expect(d.total).toBe(3);
    expect(d.matching).toBe(1);
  });

  it("refuses an unknown kind", async () => {
    const r = await getHomeCheckup({ check: "documents", property_id: "home-1", doc_type: "Secrets" });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/doc_type/);
  });

  it("caps a long list and says so", async () => {
    vi.mocked(photoService.listByJob).mockImplementation(async (jobId: string) =>
      jobId === "docs_home-1"
        ? (Array.from({ length: 80 }, (_, i) =>
            meta(`d${i}`, `[Receipt] r${i}.pdf`, Date.UTC(2024, 0, 1) + i * 86_400_000),
          ) as any)
        : [],
    );
    const d = (await getHomeCheckup({ check: "documents", property_id: "home-1" })).data as any;
    expect(d.total).toBe(80);
    expect(d.documents).toHaveLength(50);
    expect(d.truncated).toBe(true);
  });
});

describe("HC.2 inspection_readiness", () => {
  it("returns the 4-point and wind mitigation checklists for a Florida home", async () => {
    vi.mocked(jobService.getByProperty).mockResolvedValue([job({})]);
    vi.mocked(systemAgesService.get).mockReturnValue({ Roofing: 2020 });
    const r = await getHomeCheckup({ check: "inspection_readiness", property_id: "home-1" });
    const d = r.data as any;
    expect(r.success).toBe(true);
    expect(d.fourPoint.map((i: any) => i.item)).toEqual(["Roof", "Electrical", "Plumbing", "HVAC"]);
    const roof = d.fourPoint[0];
    expect(roof.status).toBe("partial");
    expect(roof.inRecord.join(" ")).toMatch(/Installed 2020/);
    expect(roof.notInRecord).toContain("Roof covering type (shingle, tile, metal)");
    expect(d.windMitigation.find((i: any) => i.item === "Roof covering").status).toBe("documented");
    expect(d.note).toMatch(/doesn't predict whether a carrier will insure/);
    expect(d.path).toBe("/insurance-defense");
  });

  it("says it doesn't apply outside Florida", async () => {
    vi.mocked(propertyService.getMyProperties).mockResolvedValue([{ ...HOME, state: "GA" }] as any);
    const r = await getHomeCheckup({ check: "inspection_readiness", property_id: "home-1" });
    expect(r.success).toBe(true);
    expect((r.data as any).applies).toBe(false);
    expect((r.data as any).fourPoint).toBeUndefined();
  });
});

describe("HC.3 reserve", () => {
  it("gives the monthly set-aside, what's due and this year's spend, with the caveat", async () => {
    const year = new Date().getFullYear();
    vi.mocked(jobService.getByProperty).mockResolvedValue([job({ date: `${year}-02-01`, amount: 45_000 })]);
    const d = (await getHomeCheckup({ check: "reserve", property_id: "home-1" })).data as any;
    expect(d.years).toBe(5);
    expect(d.systemsDue.length).toBeGreaterThan(0);
    expect(d.monthlyLowDollars).toBeGreaterThan(0);
    expect(d.monthlyHighDollars).toBeGreaterThanOrEqual(d.monthlyLowDollars);
    expect(d.spentThisYearDollars).toBe(450);
    expect(d.note).toMatch(/not a quote and not financial advice/);
  });
});

describe("HC.4 recalls", () => {
  const rooms = [
    {
      id: "r1",
      name: "Kitchen",
      fixtures: [
        { brand: "Acme", model: "DW-100" },
        { brand: "", model: "X" },
      ],
    },
  ];

  it("returns possible matches with the CPSC link and the caveat", async () => {
    vi.mocked(roomService.getRoomsByProperty).mockResolvedValue(rooms as any);
    vi.mocked(checkRecalls).mockResolvedValue([
      {
        brand: "Acme",
        model: "DW-100",
        recalls: [
          {
            id: "1",
            number: "24-001",
            date: "2024-03-01",
            title: "Acme dishwashers",
            url: "https://www.cpsc.gov/Recalls/1",
            hazard: "Fire",
            remedy: "Repair",
          },
        ],
      },
    ]);
    const d = (await getHomeCheckup({ check: "recalls", property_id: "home-1" })).data as any;
    expect(checkRecalls).toHaveBeenCalledWith([{ brand: "Acme", model: "DW-100" }]);
    expect(d.appliancesChecked).toBe(1);
    expect(d.possibleRecalls).toEqual([
      {
        brand: "Acme",
        model: "DW-100",
        title: "Acme dishwashers",
        date: "2024-03-01",
        hazard: "Fire",
        remedy: "Repair",
        url: "https://www.cpsc.gov/Recalls/1",
      },
    ]);
    expect(d.note).toMatch(/possible recall, not a confirmed one/);
  });

  it("says when no appliance has a brand and model, without calling the recall check", async () => {
    vi.mocked(roomService.getRoomsByProperty).mockResolvedValue([{ id: "r1", name: "Kitchen", fixtures: [] }] as any);
    const d = (await getHomeCheckup({ check: "recalls", property_id: "home-1" })).data as any;
    expect(checkRecalls).not.toHaveBeenCalled();
    expect(d.appliancesChecked).toBe(0);
    expect(d.note).toMatch(/brand and model/);
  });

  it("reports a failed recall check instead of saying there are none", async () => {
    vi.mocked(roomService.getRoomsByProperty).mockResolvedValue(rooms as any);
    vi.mocked(checkRecalls).mockRejectedValue(new Error("down"));
    const r = await getHomeCheckup({ check: "recalls", property_id: "home-1" });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/recall check/i);
  });
});

describe("HC.5 guards", () => {
  it("knows four checks", () => {
    expect(HOME_CHECKS).toEqual(["documents", "inspection_readiness", "reserve", "recalls"]);
  });

  it("refuses an unknown check", async () => {
    const r = await getHomeCheckup({ check: "everything", property_id: "home-1" });
    expect(r.success).toBe(false);
  });

  it("refuses a home that isn't the user's, before reading anything", async () => {
    const r = await getHomeCheckup({ check: "documents", property_id: "someone-else" });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/isn't one of the user's properties/);
    expect(photoService.listByJob).not.toHaveBeenCalled();
  });

  it("reports failed reads rather than an empty answer", async () => {
    vi.mocked(photoService.listByJob).mockRejectedValue(new Error("down"));
    const r = await getHomeCheckup({ check: "documents", property_id: "home-1" });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/documents/i);
  });
});
