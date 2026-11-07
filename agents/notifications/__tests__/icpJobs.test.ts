/**
 * getJobsByOwner (Home Pulse): service labels. #721: an Other job titled
 * with a subtype ("Septic") is labelled by it, as the web app labels it.
 */
const mockCreateActor = jest.fn();
jest.mock("@icp-sdk/core/agent", () => ({
  ...jest.requireActual("@icp-sdk/core/agent"),
  Actor: { createActor: (...a: unknown[]) => mockCreateActor(...a) },
  HttpAgent: { create: jest.fn(async () => ({})) },
}));

import { getJobsByOwner } from "../icp";

const raw = (title: string, serviceType: object) => ({
  id: title,
  propertyId: "p1",
  title,
  serviceType,
  contractorName: [],
  amount: 100n,
  completedDate: 0n,
  warrantyMonths: [],
  isDiy: true,
  status: { Completed: null },
  verified: false,
});

beforeAll(() => {
  process.env.RELAY_IDENTITY_SEED = "11".repeat(32);
  process.env.CANISTER_ID_JOB = "aaaaa-aa";
});

it("labels Other jobs by their subtype title, and other jobs by their type", async () => {
  mockCreateActor.mockReturnValue({
    getJobsByOwner: jest.fn(async () => [
      raw("Septic", { Other: null }),
      raw("Fixed the gate", { Other: null }),
      raw("Kitchen", { KitchenRemodel: null }),
    ]),
  });
  const jobs = await getJobsByOwner("2vxsx-fae");
  expect(jobs.map((j) => j.serviceType)).toEqual(["Septic", "Other", "Kitchen Remodel"]);
});
