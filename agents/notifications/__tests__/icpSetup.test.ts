/**
 * getPulseSetup / getSetupStatus: what the relay reads about a home's setup
 * (property.getPulseSetup) for the Home Pulse and the first-week tips.
 */
const mockCreateActor = jest.fn();
jest.mock("@icp-sdk/core/agent", () => ({
  ...jest.requireActual("@icp-sdk/core/agent"),
  Actor: { createActor: (...a: unknown[]) => mockCreateActor(...a) },
  HttpAgent: { create: jest.fn(async () => ({})) },
}));

import { getPulseSetup, getSetupStatus } from "../icp";

const setupRow = {
  propertyId: "P1", addedAt: 1_762_000_000_000_000_000n, hasShutoffs: true,
  systemYears: [{ name: "HVAC", installYear: 2019n }],
};

beforeAll(() => {
  process.env.RELAY_IDENTITY_SEED = "11".repeat(32);
  process.env.CANISTER_ID_PROPERTY = "aaaaa-aa";
  process.env.CANISTER_ID_JOB = "aaaaa-aa";
});
beforeEach(() => mockCreateActor.mockReset());

it("maps each home's added date (ms), system years and shutoff flag", async () => {
  mockCreateActor.mockReturnValue({ getPulseSetup: jest.fn(async () => ({ ok: [setupRow] })) });
  expect(await getPulseSetup("2vxsx-fae")).toEqual([
    { propertyId: "P1", addedAtMs: 1_762_000_000_000, hasShutoffs: true, systemYears: { HVAC: 2019 } },
  ]);
});

it("throws on an error result", async () => {
  mockCreateActor.mockReturnValue({ getPulseSetup: jest.fn(async () => ({ err: { NotAuthorized: null } })) });
  await expect(getPulseSetup("2vxsx-fae")).rejects.toThrow("getPulseSetup: NotAuthorized");
});

describe("getSetupStatus", () => {
  const actor = (jobs: { propertyId: string }[]) => ({
    getPulseSetup: jest.fn(async () => ({ ok: [setupRow] })),
    getJobsByOwner: jest.fn(async () => jobs.map((j) => ({
      id: "J", propertyId: j.propertyId, title: "t", serviceType: { HVAC: null }, contractorName: [], amount: 0n,
      completedDate: 0n, warrantyMonths: [], isDiy: true, status: { Completed: null }, verified: false,
      homeownerSigned: true, contractorSigned: false,
    }))),
  });

  it("says whether the home is still the owner's, has its shutoff written down and has a job", async () => {
    mockCreateActor.mockReturnValue(actor([{ propertyId: "P2" }]));
    expect(await getSetupStatus("2vxsx-fae", "P1")).toEqual({ exists: true, hasShutoffs: true, hasJobs: false });
    mockCreateActor.mockReturnValue(actor([{ propertyId: "P1" }]));
    expect(await getSetupStatus("2vxsx-fae", "P1")).toEqual({ exists: true, hasShutoffs: true, hasJobs: true });
    expect(await getSetupStatus("2vxsx-fae", "GONE")).toEqual({ exists: false, hasShutoffs: false, hasJobs: false });
  });

  it("returns null when the record can't be read", async () => {
    mockCreateActor.mockReturnValue({ getPulseSetup: jest.fn(async () => { throw new Error("down"); }) });
    expect(await getSetupStatus("2vxsx-fae", "P1")).toBeNull();
  });
});
