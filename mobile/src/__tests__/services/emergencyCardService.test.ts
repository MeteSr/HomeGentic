/**
 * #715: the emergency card on the phone. It is fetched while online and a
 * copy is kept on the phone so it still opens when the network is down
 * (storms take out power and cell data). The copy leaves out alarm notes,
 * since they can hold an alarm code.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

const mockActor = { getHouseGuide: jest.fn(), getInsurancePolicy: jest.fn() };
jest.mock("../../services/canister", () => {
  const actual = jest.requireActual("../../services/canister");
  return { ...actual, actorFor: () => mockActor };
});

import { fetchEmergencyCard, loadEmergencyCard, clearSavedEmergencyCards } from "../../services/emergencyCardService";
import { buildEmergencyCard } from "@homegentic/shared/emergency";

const GUIDE = {
  wifiName: "home",
  wifiPassword: "pw",
  alarm: "Code 1234",
  trashDay: "",
  recyclingDay: "",
  waterShutoff: "Front yard",
  gasShutoff: "",
  electricPanel: "Garage",
  contacts: [{ name: "Claims", role: "Insurance claims", phone: "800-555-0100" }],
  notes: "",
  photoIds: [],
  updatedAt: 0n,
};
const POLICY = {
  carrier: "Citizens",
  policyNumber: "FL-1",
  renewalDate: "2027-01-01",
  coverageACents: [],
  hurricaneDeductible: [],
  updatedAt: 0n,
};

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  mockActor.getHouseGuide.mockResolvedValue({ ok: [GUIDE] });
  mockActor.getInsurancePolicy.mockResolvedValue({ ok: [POLICY] });
});

describe("fetchEmergencyCard", () => {
  it("builds the card from the guide and policy", async () => {
    const card = await fetchEmergencyCard("p1");
    expect(mockActor.getHouseGuide).toHaveBeenCalledWith("p1");
    expect(card.shutoffs[0].where).toBe("Front yard");
    expect(card.insurer?.carrier).toBe("Citizens");
    expect(card.insurer?.claimLine?.phone).toBe("800-555-0100");
    expect(card.alarm).toBe("Code 1234");
  });

  it("works with no guide and no policy", async () => {
    mockActor.getHouseGuide.mockResolvedValue({ ok: [] });
    mockActor.getInsurancePolicy.mockResolvedValue({ ok: [] });
    const card = await fetchEmergencyCard("p1");
    expect(card.isEmpty).toBe(true);
  });

  it("throws a readable error when the canister refuses", async () => {
    mockActor.getHouseGuide.mockResolvedValue({ err: { NotAuthorized: null } });
    await expect(fetchEmergencyCard("p1")).rejects.toThrow();
  });
});

describe("loadEmergencyCard", () => {
  const card = buildEmergencyCard({
    guide: {
      waterShutoff: "Front yard",
      gasShutoff: "",
      electricPanel: "",
      alarm: "Code 1234",
      contacts: [],
      photoIds: [],
    },
    policy: null,
    photos: [],
  });

  it("returns the live card and keeps a copy on the phone without the alarm notes", async () => {
    const got = await loadEmergencyCard(
      "p1",
      "alice",
      async () => card,
      () => 1000,
    );
    expect(got).toEqual({ card, savedAt: 1000, fromPhone: false });
    const saved = JSON.parse((await AsyncStorage.getItem("homegentic_emergency_card_alice_p1"))!);
    expect(saved.savedAt).toBe(1000);
    expect(saved.card.shutoffs[0].where).toBe("Front yard");
    expect(saved.card.alarm).toBe("");
  });

  it("opens the copy on the phone when the network is down", async () => {
    await loadEmergencyCard(
      "p1",
      "alice",
      async () => card,
      () => 1000,
    );
    const got = await loadEmergencyCard("p1", "alice", async () => {
      throw new Error("Network request failed");
    });
    expect(got?.fromPhone).toBe(true);
    expect(got?.savedAt).toBe(1000);
    expect(got?.card.shutoffs[0].where).toBe("Front yard");
  });

  it("keeps each signed-in person's copy separate", async () => {
    await loadEmergencyCard(
      "p1",
      "alice",
      async () => card,
      () => 1000,
    );
    const got = await loadEmergencyCard("p1", "bob", async () => {
      throw new Error("offline");
    });
    expect(got).toBeNull();
  });

  it("is null offline with nothing saved, and ignores a damaged copy", async () => {
    const offline = async () => {
      throw new Error("offline");
    };
    expect(await loadEmergencyCard("p1", "alice", offline)).toBeNull();
    await AsyncStorage.setItem("homegentic_emergency_card_alice_p1", "{not json");
    expect(await loadEmergencyCard("p1", "alice", offline)).toBeNull();
  });

  it("still returns the live card when the phone can't save it", async () => {
    // The storage mock's methods are jest.fns already: queue one failure, don't restore.
    (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error("disk full"));
    const got = await loadEmergencyCard(
      "p1",
      "alice",
      async () => card,
      () => 5,
    );
    expect(got?.fromPhone).toBe(false);
  });
});

describe("clearSavedEmergencyCards", () => {
  it("removes every saved card on sign-out and leaves other app data", async () => {
    await AsyncStorage.setItem("homegentic_emergency_card_alice_p1", "{}");
    await AsyncStorage.setItem("homegentic_emergency_card_bob_p2", "{}");
    await AsyncStorage.setItem("homegentic_offline_queue", "[]");
    await clearSavedEmergencyCards();
    expect(await AsyncStorage.getItem("homegentic_emergency_card_alice_p1")).toBeNull();
    expect(await AsyncStorage.getItem("homegentic_emergency_card_bob_p2")).toBeNull();
    expect(await AsyncStorage.getItem("homegentic_offline_queue")).toBe("[]");
  });
});
