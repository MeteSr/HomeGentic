/**
 * getSuccessionNotice (#724): maps property.getSuccessionNotice for the
 * waiting-period emails.
 */
const mockCreateActor = jest.fn();
jest.mock("@icp-sdk/core/agent", () => ({
  ...jest.requireActual("@icp-sdk/core/agent"),
  Actor: { createActor: (...a: unknown[]) => mockCreateActor(...a) },
  HttpAgent: { create: jest.fn(async () => ({})) },
}));

import { Principal } from "@icp-sdk/core/principal";
import { getSuccessionNotice } from "../icp";

const owner = Principal.fromText("2vxsx-fae");
const heir = Principal.fromText("aaaaa-aa");

beforeAll(() => {
  process.env.RELAY_IDENTITY_SEED = "11".repeat(32);
  process.env.CANISTER_ID_PROPERTY = "aaaaa-aa";
});

it("maps the claim, its times in ms and the household", async () => {
  mockCreateActor.mockReturnValue({
    getSuccessionNotice: jest.fn(async () => ({
      ok: [
        {
          claim: {
            id: "sc-1",
            propertyId: "P1",
            claimant: heir,
            status: { Approved: { at: 5n } },
            openedAt: 1_000_000_000n,
            waitEndsAt: 2_000_000_000n,
          },
          address: "70 Heritage Way",
          household: [owner],
        },
      ],
    })),
  });
  expect(await getSuccessionNotice("sc-1")).toEqual({
    claimId: "sc-1",
    propertyId: "P1",
    claimant: heir.toText(),
    status: "Approved",
    openedAtMs: 1000,
    waitEndsAtMs: 2000,
    address: "70 Heritage Way",
    household: [owner.toText()],
  });
});

it("returns null for a missing claim and throws when the relay isn't allowed", async () => {
  mockCreateActor.mockReturnValue({ getSuccessionNotice: jest.fn(async () => ({ ok: [] })) });
  expect(await getSuccessionNotice("sc-9")).toBeNull();
  mockCreateActor.mockReturnValue({ getSuccessionNotice: jest.fn(async () => ({ err: { NotAuthorized: null } })) });
  await expect(getSuccessionNotice("sc-1")).rejects.toThrow("NotAuthorized");
});
