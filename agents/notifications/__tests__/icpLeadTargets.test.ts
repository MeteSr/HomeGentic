/**
 * getContractors (lead alerts), X-4 of the 2026-11-11 security review:
 * contractor.getLeadAlertTargets now answers only notifiers and admins, so
 * the relay signs with its own identity, and it walks every page instead of
 * stopping at the first 500 contractors.
 */
import { Principal } from "@icp-sdk/core/principal";

const mockCreateActor = jest.fn();
jest.mock("@icp-sdk/core/agent", () => ({
  ...jest.requireActual("@icp-sdk/core/agent"),
  Actor: { createActor: (...a: unknown[]) => mockCreateActor(...a) },
  HttpAgent: { create: jest.fn(async (opts: { identity?: unknown }) => ({ identity: opts?.identity })) },
}));

import { getContractors } from "../icp";

const target = (i: number) => ({
  id: Principal.fromUint8Array(new Uint8Array([1, i >> 8, i & 255])),
  specialties: [{ Plumbing: null }],
  serviceZips: ["32801"],
  alertZips: [],
  notifyPush: [true],
  trustScore: 70n,
  jobsCompleted: 0n,
  isVerified: false,
});

beforeAll(() => {
  process.env.RELAY_IDENTITY_SEED = "11".repeat(32);
  process.env.CANISTER_ID_CONTRACTOR = "aaaaa-aa";
});

it("pages through every contractor, signed as the relay", async () => {
  const all = Array.from({ length: 450 }, (_, i) => target(i));
  const page = jest.fn(async (after: [] | [Principal], limit: bigint) => {
    const from = after.length ? all.findIndex((t) => t.id.toText() === after[0].toText()) + 1 : 0;
    return all.slice(from, from + Number(limit));
  });
  mockCreateActor.mockReturnValue({ getLeadAlertTargetsPage: page });

  const got = await getContractors();

  expect(got).toHaveLength(450);
  expect(new Set(got.map((c) => c.principal)).size).toBe(450);
  expect(page.mock.calls.length).toBeGreaterThan(1);
  const [, opts] = mockCreateActor.mock.calls[0] as [unknown, { agent: { identity?: unknown } }];
  expect(opts.agent.identity).toBeDefined();
});
