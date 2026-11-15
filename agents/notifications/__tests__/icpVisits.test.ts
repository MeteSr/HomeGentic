/**
 * getVisitBooking: maps quote.getVisitBookings for the visit notifications
 * and the day-before reminder.
 */
const mockCreateActor = jest.fn();
jest.mock("@icp-sdk/core/agent", () => ({
  ...jest.requireActual("@icp-sdk/core/agent"),
  Actor: { createActor: (...a: unknown[]) => mockCreateActor(...a) },
  HttpAgent: { create: jest.fn(async () => ({})) },
}));

import { getVisitBooking } from "../icp";

beforeAll(() => {
  process.env.RELAY_IDENTITY_SEED = "11".repeat(32);
  process.env.CANISTER_ID_QUOTE = "aaaaa-aa";
});

it("maps a booked visit with its start in ms", async () => {
  const getVisitBookings = jest.fn(async () => [
    {
      quoteId: "Q_1",
      requestId: "REQ_1",
      status: { Booked: null },
      offered: [],
      booked: [{ startsAt: 3_000_000_000n, endsAt: 4_000_000_000n }],
      note: "",
      updatedAt: 0n,
    },
  ]);
  mockCreateActor.mockReturnValue({ getVisitBookings });
  expect(await getVisitBooking("Q_1")).toEqual({
    quoteId: "Q_1",
    requestId: "REQ_1",
    status: "Booked",
    startsAtMs: 3000,
  });
  expect(getVisitBookings).toHaveBeenCalledWith(["Q_1"]);
});

it("has no start when nothing is booked, and null when there's no booking", async () => {
  mockCreateActor.mockReturnValue({
    getVisitBookings: jest.fn(async () => [
      {
        quoteId: "Q_1",
        requestId: "REQ_1",
        status: { Cancelled: null },
        offered: [],
        booked: [],
        note: "",
        updatedAt: 0n,
      },
    ]),
  });
  expect((await getVisitBooking("Q_1"))?.startsAtMs).toBeNull();
  mockCreateActor.mockReturnValue({ getVisitBookings: jest.fn(async () => []) });
  expect(await getVisitBooking("Q_9")).toBeNull();
});
