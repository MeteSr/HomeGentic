/**
 * @jest-environment node
 */
// Recall alerts: the relay checks the appliances saved on each owner's homes
// against CPSC recalls every week, and tells the owner about a possible
// recall once (in the Home Pulse email and by push), not every week after.
//
//  RA.1 one CPSC call per brand per day, shared by every owner in a run
//  RA.2 only matches the owner hasn't been told about come back
//  RA.3 the email item says "may", names the room, and links the CPSC notice
//  RA.4 the Home Pulse email leads with new recalls (after sign-offs) and
//       remembers them only once the email went out
//  RA.5 a CPSC or canister failure never holds up the email
//  RA.6 push goes out with the product_recall push setting on, also to
//       owners who turned the weekly email off
jest.mock("web-push", () => ({
  setVapidDetails: jest.fn(),
  sendNotification: jest.fn(),
  generateVAPIDKeys: jest.fn(() => ({ publicKey: "BPub", privateKey: "Priv" })), // gitleaks:allow
}));

import {
  brandRecallFetcher,
  newRecallMatches,
  recallItem,
  recallPush,
  markRecallsNotified,
  resetRecallAlerts,
  type ApplianceRecall,
} from "../recalls";
import { buildSection, resetPulseState, runPulse, type PulseDeps } from "../pulse";
import { getPrefs, setPrefs } from "../prefs";
import { toRecall, type Recall } from "../../../packages/shared/src/recalls";
import type { PulseAppliance, PulseJob, PulseProperty } from "../types";

const MONDAY = Date.UTC(2026, 9, 19, 14);
const NEXT_MONDAY = MONDAY + 7 * 86_400_000;

const HOUSE: PulseProperty = {
  id: "P1",
  address: "12 Elm St",
  city: "Raleigh",
  state: "NC",
  zipCode: "27601",
  yearBuilt: 2000,
};

const RHEEM_RECALL = toRecall({
  RecallID: 9001,
  RecallNumber: "24-123",
  RecallDate: "2024-03-07T00:00:00",
  Title: "Rheem Recalls Gas Water Heaters Due to Fire Hazard",
  URL: "https://www.cpsc.gov/Recalls/2024/Rheem-Recalls-Gas-Water-Heaters",
  Products: [{ Name: "Gas water heaters", Model: "XE50T" }],
  Hazards: [{ Name: "The gas valve can leak, posing a fire hazard." }],
  Remedies: [{ Name: "Repair" }],
});

const WATER_HEATER: PulseAppliance = { propertyId: "P1", room: "Garage", brand: "Rheem", model: "XE50T10H45U0" };
const FRIDGE: PulseAppliance = { propertyId: "P1", room: "Kitchen", brand: "Whirlpool", model: "WRF555SDFZ" };

function job(over: Partial<PulseJob> = {}): PulseJob {
  return {
    id: "J1",
    propertyId: "P1",
    title: "Furnace service",
    serviceType: "HVAC",
    contractorName: "Bell & Sons",
    amountCents: 18_000,
    completedAtMs: Date.UTC(2025, 9, 1),
    warrantyMonths: null,
    isDiy: false,
    status: "Verified",
    verified: true,
    homeownerSigned: true,
    contractorSigned: true,
    ...over,
  };
}

beforeEach(() => {
  resetRecallAlerts();
  resetPulseState();
});

describe("RA.1 brandRecallFetcher", () => {
  it("calls CPSC once per brand per day, case-insensitively", async () => {
    let now = MONDAY;
    const fetchImpl = jest.fn(async () => new Response(JSON.stringify([{ RecallID: 1, Title: "X" }]), { status: 200 }));
    const forBrand = brandRecallFetcher(fetchImpl as unknown as typeof fetch, () => now);
    await forBrand("Rheem");
    await forBrand("rheem");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(String((fetchImpl.mock.calls[0] as unknown[])[0])).toContain("Manufacturer=Rheem");
    now += 25 * 3_600_000;
    await forBrand("Rheem");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("throws when CPSC fails, and doesn't cache the failure", async () => {
    const fetchImpl = jest.fn(async () => new Response("down", { status: 503 }));
    const forBrand = brandRecallFetcher(fetchImpl as unknown as typeof fetch, () => MONDAY);
    await expect(forBrand("Rheem")).rejects.toThrow("CPSC 503");
    await expect(forBrand("Rheem")).rejects.toThrow("CPSC 503");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe("RA.2 newRecallMatches", () => {
  const forBrand = async (b: string): Promise<Recall[]> => (b.toLowerCase() === "rheem" ? [RHEEM_RECALL] : []);

  it("returns matches for the owner's appliances", async () => {
    const found = await newRecallMatches("owner-a", [WATER_HEATER, FRIDGE], forBrand);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ propertyId: "P1", room: "Garage", brand: "Rheem", model: "XE50T10H45U0" });
    expect(found[0].recall).toMatchObject({ id: "9001", title: RHEEM_RECALL.title, url: RHEEM_RECALL.url });
  });

  it("leaves out recalls the owner was already told about, per owner", async () => {
    const found = await newRecallMatches("owner-a", [WATER_HEATER], forBrand);
    markRecallsNotified("owner-a", found);
    expect(await newRecallMatches("owner-a", [WATER_HEATER], forBrand)).toEqual([]);
    expect(await newRecallMatches("owner-b", [WATER_HEATER], forBrand)).toHaveLength(1);
  });

  it("skips a brand whose lookup fails and still checks the others", async () => {
    const flaky = async (b: string) => {
      if (b === "Whirlpool") throw new Error("CPSC 503");
      return forBrand(b);
    };
    expect(await newRecallMatches("owner-a", [FRIDGE, WATER_HEATER], flaky)).toHaveLength(1);
  });
});

describe("RA.3 recallItem and recallPush", () => {
  const match: ApplianceRecall = {
    ...WATER_HEATER,
    recall: {
      id: "9001",
      number: "24-123",
      date: "2024-03-07",
      title: RHEEM_RECALL.title,
      url: RHEEM_RECALL.url,
      hazard: RHEEM_RECALL.hazard,
      remedy: "Repair",
    },
  };

  it("is a possible recall, names the room, and links the notice", () => {
    const item = recallItem(match);
    expect(item.tag).toBe("RECALL");
    expect(item.title).toBe("Possible recall: Rheem XE50T10H45U0 (Garage)");
    expect(item.body).toContain("may cover");
    expect(item.body).toContain("Compare the model number");
    expect(item.body).toContain("gas valve can leak");
    expect(item.link).toEqual({ label: "CPSC recall notice", url: RHEEM_RECALL.url });
  });

  it("links the CPSC search when the notice has no URL", () => {
    const item = recallItem({ ...match, recall: { ...match.recall, url: "" } });
    expect(item.link?.url).toBe("https://www.cpsc.gov/Recalls");
  });

  it("summarises one or several matches in one push", () => {
    expect(recallPush([match])).toMatchObject({ title: "Possible recall: Rheem XE50T10H45U0", route: "dashboard" });
    expect(recallPush([match, { ...match, brand: "GE", model: "GTW485" }]).title).toBe(
      "2 possible recalls on your appliances",
    );
  });
});

describe("RA.4–RA.6 in the weekly run", () => {
  const owners = ["owner-a"];
  function deps(over: Partial<PulseDeps> = {}) {
    return {
      emailEnabled: () => true,
      publicUrl: () => "https://relay.example.com",
      getRecipients: jest.fn(async (after: string | null) =>
        after ? [] : owners.map((p) => ({ principal: p, email: `${p}@example.com` })),
      ),
      getProperties: jest.fn(async () => [HOUSE]),
      getJobs: jest.fn(async () => [job()]),
      getSnapshots: jest.fn(async () => []),
      getInsurance: jest.fn(async () => []),
      getHomeFinance: jest.fn(async () => []),
      getPropertyTax: jest.fn(async () => []),
      getAppliances: jest.fn(async () => [WATER_HEATER, FRIDGE]),
      recallsForBrand: jest.fn(async (b: string) => (b.toLowerCase() === "rheem" ? [RHEEM_RECALL] : [])),
      wantsPulse: () => true,
      wantsRecallPush: () => true,
      send: jest.fn(async () => undefined),
      push: jest.fn(async () => undefined),
      pause: async () => undefined,
      ...over,
    } as PulseDeps & { send: jest.Mock; push: jest.Mock };
  }

  it("RA.4 puts a new recall in the email once, after sign-offs", async () => {
    const d = deps();
    expect(await runPulse(MONDAY, d)).toBe(1);
    const msg = d.send.mock.calls[0][1];
    expect(msg.text).toContain("[RECALL] Possible recall: Rheem XE50T10H45U0 (Garage)");
    expect(msg.html).toContain("https://www.cpsc.gov/Recalls/2024/Rheem-Recalls-Gas-Water-Heaters");
    expect(msg.subject).toMatch(/thing/);

    await runPulse(NEXT_MONDAY, d);
    expect(d.send).toHaveBeenCalledTimes(2);
    expect(d.send.mock.calls[1][1].text).not.toContain("[RECALL]");
  });

  it("RA.4 orders recalls after sign-offs and before everything else", () => {
    const pending = job({
      id: "J2",
      title: "Gutter cleaning",
      status: "PendingHomeownerApproval",
      verified: false,
      homeownerSigned: false,
    });
    const match = { ...WATER_HEATER, recall: { ...RHEEM_RECALL } };
    const s = buildSection(HOUSE, [job(), pending], [], MONDAY, null, null, null, [match]);
    expect(s.items.map((i) => i.tag).slice(0, 2)).toEqual(["SIGN OFF", "RECALL"]);
  });

  it("RA.4 doesn't remember a recall when the email failed", async () => {
    const d = deps({
      send: jest.fn(async () => {
        throw new Error("resend down");
      }),
    });
    await runPulse(MONDAY, d);
    const ok = deps();
    await runPulse(NEXT_MONDAY, ok);
    expect(ok.send.mock.calls[0][1].text).toContain("[RECALL]");
  });

  it("RA.5 still sends the email when appliances or CPSC can't be read", async () => {
    for (const over of [
      {
        getAppliances: jest.fn(async () => {
          throw new Error("old canister");
        }),
      },
      {
        recallsForBrand: jest.fn(async () => {
          throw new Error("CPSC 503");
        }),
      },
    ]) {
      resetPulseState();
      const d = deps(over as Partial<PulseDeps>);
      expect(await runPulse(MONDAY, d)).toBe(1);
      expect(d.send.mock.calls[0][1].text).not.toContain("[RECALL]");
    }
  });

  it("RA.6 pushes new recalls when the push setting is on", async () => {
    const d = deps();
    await runPulse(MONDAY, d);
    expect(d.push).toHaveBeenCalledWith(
      "owner-a",
      expect.objectContaining({ title: "Possible recall: Rheem XE50T10H45U0" }),
    );

    resetRecallAlerts();
    resetPulseState();
    const off = deps({ wantsRecallPush: () => false });
    await runPulse(MONDAY, off);
    expect(off.push).not.toHaveBeenCalled();
    expect(off.send.mock.calls[0][1].text).toContain("[RECALL]");
  });

  it("RA.6 pushes (once) to owners who turned the weekly email off", async () => {
    const d = deps({ wantsPulse: () => false });
    expect(await runPulse(MONDAY, d)).toBe(0);
    expect(d.send).not.toHaveBeenCalled();
    expect(d.push).toHaveBeenCalledTimes(1);
    await runPulse(NEXT_MONDAY, d);
    expect(d.push).toHaveBeenCalledTimes(1);
  });

  it("RA.6 the product_recall push setting is on by default and can be turned off", () => {
    expect(getPrefs("someone-new").push.product_recall).toBe(true);
    setPrefs("someone-off", { push: { product_recall: false } });
    expect(getPrefs("someone-off").push.product_recall).toBe(false);
  });
});
