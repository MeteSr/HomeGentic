import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Stateful stand-in for the property canister's #725 methods, plus the photo
// canister's getGuidePhotoData (both actors come from the same mock).
const guides = new Map<string, any>();
const links: any[] = [];
const mockActor = {
  getHouseGuide: vi.fn(async (propertyId: string) =>
    propertyId === "missing"
      ? { err: { NotFound: null } }
      : { ok: guides.has(propertyId) ? [guides.get(propertyId)] : [] },
  ),
  setHouseGuide: vi.fn(async (propertyId: string, guide: any[]) => {
    if (propertyId === "missing") return { err: { NotFound: null } };
    if (guide.length === 0) guides.delete(propertyId);
    else guides.set(propertyId, { ...guide[0], updatedAt: 1_700_000_000_000_000_000n });
    return { ok: null };
  }),
  createHouseGuideLink: vi.fn(async (propertyId: string, name: string, days: bigint) => {
    if (!guides.has(propertyId)) return { err: { InvalidInput: "Write the house guide before sharing it" } };
    const link = {
      token: "a".repeat(64),
      propertyId,
      name,
      createdBy: {},
      createdAt: 1_700_000_000_000_000_000n,
      expiresAt: 1_700_000_000_000_000_000n + days * 86_400_000_000_000n,
      revoked: false,
    };
    links.push(link);
    return { ok: link };
  }),
  listHouseGuideLinks: vi.fn(async () => ({ ok: links })),
  revokeHouseGuideLink: vi.fn(async (token: string) => {
    const l = links.find((x) => x.token === token);
    if (!l) return { err: { NotFound: null } };
    l.revoked = true;
    return { ok: null };
  }),
  getSharedHouseGuide: vi.fn(async (token: string) => {
    if (token === "broken") return { err: { Unavailable: "property is down" } };
    const l = links.find((x) => x.token === token && !x.revoked);
    if (!l) return { err: { NotFound: null } };
    return {
      ok: {
        address: "12 Guide Lane",
        city: "Orlando",
        state: "FL",
        zipCode: "32801",
        guide: guides.get(l.propertyId),
        expiresAt: l.expiresAt,
      },
    };
  }),
  getGuidePhotoData: vi.fn(async (_token: string, photoId: string) => {
    if (photoId === "onchain") return { ok: new Uint8Array([1, 2, 3]) };
    if (photoId === "offchain") return { ok: new Uint8Array([]) };
    return { err: { NotFound: null } };
  }),
};

vi.mock("@/services/actor", () => ({ getAgent: vi.fn().mockResolvedValue({}) }));
vi.mock("@icp-sdk/core/agent", () => ({ Actor: { createActor: vi.fn(() => mockActor) } }));

import {
  houseGuideService,
  validateGuide,
  linkState,
  guideLinkUrl,
  EMPTY_GUIDE,
  type HouseGuide,
} from "@/services/houseGuide";

const GUIDE: HouseGuide = {
  ...EMPTY_GUIDE,
  wifiName: "Lake House",
  wifiPassword: " spaced pass ",
  alarm: "Code 4821",
  trashDay: "Tuesday night",
  waterShutoff: "Garage, red handle",
  contacts: [{ name: "Ana", role: "Spare key", phone: "407-555-0142" }],
  photoIds: ["onchain"],
};

beforeEach(() => {
  guides.clear();
  links.length = 0;
  vi.clearAllMocks();
});
afterEach(() => {
  delete (window as any).__e2e_house_guides;
  delete (window as any).__e2e_guide_links;
});

describe("houseGuideService", () => {
  it("saves a guide and reads it back", async () => {
    expect(await houseGuideService.get("p1")).toBeNull();
    await houseGuideService.save("p1", GUIDE);
    expect(mockActor.setHouseGuide).toHaveBeenCalledWith("p1", [GUIDE]);
    expect(await houseGuideService.get("p1")).toEqual({ ...GUIDE, updatedAt: 1_700_000_000_000 });
    await houseGuideService.save("p1", null);
    expect(mockActor.setHouseGuide).toHaveBeenLastCalledWith("p1", []);
    expect(await houseGuideService.get("p1")).toBeNull();
  });

  it("creates, lists and revokes links", async () => {
    await houseGuideService.save("p1", GUIDE);
    const link = await houseGuideService.createLink("p1", "Cat sitter", 7);
    expect(mockActor.createHouseGuideLink).toHaveBeenCalledWith("p1", "Cat sitter", 7n);
    expect(link).toEqual({
      token: "a".repeat(64),
      name: "Cat sitter",
      createdAt: 1_700_000_000_000,
      expiresAt: 1_700_000_000_000 + 7 * 86_400_000,
      revoked: false,
    });
    expect(await houseGuideService.listLinks("p1")).toEqual([link]);
    await houseGuideService.revokeLink(link.token);
    expect((await houseGuideService.listLinks("p1"))[0].revoked).toBe(true);
  });

  it("reads a shared guide, and null for a dead link", async () => {
    await houseGuideService.save("p1", GUIDE);
    const link = await houseGuideService.createLink("p1", "", 1);
    const shared = await houseGuideService.getShared(link.token);
    expect(shared).toMatchObject({ address: "12 Guide Lane", city: "Orlando", state: "FL", zipCode: "32801" });
    expect(shared?.guide.wifiPassword).toBe(" spaced pass ");
    expect(shared?.expiresAt).toBe(link.expiresAt);
    expect(await houseGuideService.getShared("f".repeat(64))).toBeNull();
    await expect(houseGuideService.getShared("broken")).rejects.toMatchObject({ code: "Unavailable" });
  });

  it("throws canister errors", async () => {
    await expect(houseGuideService.get("missing")).rejects.toMatchObject({ code: "NotFound" });
    await expect(houseGuideService.createLink("p9", "x", 7)).rejects.toMatchObject({ code: "InvalidInput" });
    await expect(houseGuideService.revokeLink("nope")).rejects.toMatchObject({ code: "NotFound" });
  });

  it("loads a shared photo from the canister, or from the Worker when it is stored off-chain", async () => {
    const createObjectURL = vi.fn(() => "blob:onchain");
    const original = URL.createObjectURL;
    URL.createObjectURL = createObjectURL as any;
    try {
      const token = "b".repeat(64);
      expect(await houseGuideService.sharedPhotoUrl(token, "onchain")).toBe("blob:onchain");
      expect(await houseGuideService.sharedPhotoUrl(token, "offchain")).toMatch(
        new RegExp(`/photos/offchain\\?guide=${token}$`),
      );
      expect(await houseGuideService.sharedPhotoUrl(token, "gone")).toBe("");
    } finally {
      URL.createObjectURL = original;
    }
  });

  it("uses the e2e stand-ins when they are injected", async () => {
    (window as any).__e2e_house_guides = { p1: GUIDE };
    (window as any).__e2e_guide_links = [];
    expect(await houseGuideService.get("p1")).toEqual(GUIDE);
    await houseGuideService.save("p2", GUIDE);
    expect((window as any).__e2e_house_guides.p2).toEqual(GUIDE);
    const link = await houseGuideService.createLink("p1", "Sitter", 3);
    expect(link.token).toMatch(/^[0-9a-f]{64}$/);
    expect(await houseGuideService.listLinks("p1")).toEqual([link]);
    const shared = await houseGuideService.getShared(link.token);
    expect(shared?.guide.wifiName).toBe("Lake House");
    await houseGuideService.revokeLink(link.token);
    expect(await houseGuideService.getShared(link.token)).toBeNull();
    await houseGuideService.save("p1", null);
    expect((window as any).__e2e_house_guides.p1).toBeUndefined();
    expect(mockActor.getHouseGuide).not.toHaveBeenCalled();
  });
});

describe("validateGuide", () => {
  it("accepts a guide with anything in it", () => {
    expect(validateGuide(GUIDE)).toBeNull();
    expect(validateGuide({ ...EMPTY_GUIDE, notes: "Water the plants" })).toBeNull();
  });

  it("matches the canister's rules", () => {
    expect(validateGuide(EMPTY_GUIDE)).toMatch(/at least one/i);
    expect(validateGuide({ ...GUIDE, wifiName: "x".repeat(101) })).toMatch(/Wi-Fi name/);
    expect(validateGuide({ ...GUIDE, alarm: "x".repeat(501) })).toMatch(/Alarm/);
    expect(validateGuide({ ...GUIDE, notes: "x".repeat(4001) })).toMatch(/4,000/);
    expect(validateGuide({ ...GUIDE, contacts: [{ name: " ", role: "", phone: "" }] })).toMatch(/name/);
    expect(validateGuide({ ...GUIDE, contacts: Array(11).fill({ name: "A", role: "", phone: "" }) })).toMatch(
      /10 contacts/,
    );
    expect(validateGuide({ ...GUIDE, contacts: [{ name: "A", role: "", phone: "x".repeat(41) }] })).toMatch(/phone/);
    expect(validateGuide({ ...GUIDE, photoIds: Array(7).fill("p") })).toMatch(/6 photos/);
  });
});

describe("linkState and guideLinkUrl", () => {
  const link = { token: "t", name: "", createdAt: 0, expiresAt: 1000, revoked: false };
  it("says whether a link still works", () => {
    expect(linkState(link, 999)).toBe("live");
    expect(linkState(link, 1000)).toBe("expired");
    expect(linkState({ ...link, revoked: true }, 0)).toBe("revoked");
  });
  it("builds the page address", () => {
    expect(guideLinkUrl("abc", "https://homegentic.app")).toBe("https://homegentic.app/guide/abc");
  });
});
