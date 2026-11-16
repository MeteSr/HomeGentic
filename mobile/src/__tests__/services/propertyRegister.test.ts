/**
 * @jest-environment node
 *
 * Adding a home from the app goes to the same property canister method the
 * web wizard uses.
 */
const mockActor = { registerProperty: jest.fn(), startMoveInPlan: jest.fn() };
jest.mock("../../services/canister", () => ({
  ...jest.requireActual("../../services/canister"),
  actorFor: () => mockActor,
}));

import { registerProperty, startMoveInPlan } from "../../services/propertyService";

const raw = {
  id: "P9",
  owner: { toText: () => "me" },
  address: "12 Elm St",
  city: "Raleigh",
  state: "NC",
  zipCode: "27601",
  propertyType: { SingleFamily: null },
  yearBuilt: 1990n,
  squareFeet: 1850n,
  verificationLevel: { Unverified: null },
  verificationMethod: [],
  verificationDate: [],
  verificationDocHash: [],
  tier: { Free: null },
  createdAt: 1n,
  updatedAt: 1n,
  isActive: true,
};

beforeEach(() => jest.clearAllMocks());

it("sends Candid variants and whole numbers, and returns the saved home", async () => {
  mockActor.registerProperty.mockResolvedValue({ ok: raw });
  const p = await registerProperty({
    address: "12 Elm St",
    city: "Raleigh",
    state: "NC",
    zipCode: "27601",
    propertyType: "SingleFamily",
    yearBuilt: 1990,
    squareFeet: 1850,
    tier: "Free",
  });
  expect(mockActor.registerProperty).toHaveBeenCalledWith({
    address: "12 Elm St",
    city: "Raleigh",
    state: "NC",
    zipCode: "27601",
    propertyType: { SingleFamily: null },
    yearBuilt: 1990n,
    squareFeet: 1850n,
    tier: { Free: null },
  });
  expect(p).toMatchObject({ id: "P9", city: "Raleigh", yearBuilt: 1990 });
});

it("throws the canister's message, e.g. the Free plan's one-home limit", async () => {
  mockActor.registerProperty.mockResolvedValue({ err: { InvalidInput: "The Free plan includes 1 home" } });
  await expect(
    registerProperty({
      address: "1 A St",
      city: "B",
      state: "FL",
      zipCode: "33101",
      propertyType: "Condo",
      yearBuilt: 2000,
      squareFeet: 900,
      tier: "Free",
    }),
  ).rejects.toThrow(/Free plan includes 1 home/);
});

it("starts the move-in plan for a home", async () => {
  mockActor.startMoveInPlan.mockResolvedValue({ ok: {} });
  await startMoveInPlan("P9");
  expect(mockActor.startMoveInPlan).toHaveBeenCalledWith("P9");
  mockActor.startMoveInPlan.mockResolvedValue({ err: { NotAuthorized: null } });
  await expect(startMoveInPlan("P9")).rejects.toMatchObject({ code: "NotAuthorized" });
});
