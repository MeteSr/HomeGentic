/**
 * getPulseAppliances: maps property.getPulseAppliances for the weekly recall
 * check, and turns an error result into a thrown error (pulse.ts catches it).
 */
const mockCreateActor = jest.fn();
jest.mock("@icp-sdk/core/agent", () => ({
  ...jest.requireActual("@icp-sdk/core/agent"),
  Actor: { createActor: (...a: unknown[]) => mockCreateActor(...a) },
  HttpAgent: { create: jest.fn(async () => ({})) },
}));

import { getPulseAppliances } from "../icp";

beforeAll(() => {
  process.env.RELAY_IDENTITY_SEED = "11".repeat(32);
  process.env.CANISTER_ID_PROPERTY = "aaaaa-aa";
});

it("maps each appliance to property, room, brand and model", async () => {
  mockCreateActor.mockReturnValue({
    getPulseAppliances: jest.fn(async () => ({
      ok: [{ propertyId: "P1", room: "Garage", brand: "Rheem", model: "XE50T10H45U0", extra: "dropped" }],
    })),
  });
  expect(await getPulseAppliances("2vxsx-fae")).toEqual([
    { propertyId: "P1", room: "Garage", brand: "Rheem", model: "XE50T10H45U0" },
  ]);
});

it("throws on an error result", async () => {
  mockCreateActor.mockReturnValue({ getPulseAppliances: jest.fn(async () => ({ err: { NotAuthorized: null } })) });
  await expect(getPulseAppliances("2vxsx-fae")).rejects.toThrow("getPulseAppliances: NotAuthorized");
});
