/**
 * @jest-environment node
 *
 * Mobile authService against the auth canister (test-gap audit 2026-11-03,
 * M1): profile fetch on sign-in and the agent-session token the
 * notification relay and the voice Worker accept.
 */

const mockActor = { getProfile: jest.fn(), issueAgentSession: jest.fn() };
const mockActorFor = jest.fn(() => mockActor);
jest.mock("../../services/canister", () => ({ actorFor: (...a: unknown[]) => (mockActorFor as any)(...a) }));

const agent = {} as any;
const raw = {
  principal: { toText: () => "p-1" },
  role: { Contractor: null },
  email: "a@b.c",
  phone: "",
  createdAt: 1n,
  updatedAt: 1n,
  isActive: true,
  lastLoggedIn: [],
};

function load(canisterId: string | undefined) {
  if (canisterId === undefined) delete process.env.EXPO_PUBLIC_AUTH_CANISTER_ID;
  else process.env.EXPO_PUBLIC_AUTH_CANISTER_ID = canisterId;
  let mod!: typeof import("../../services/authService");
  jest.isolateModules(() => {
    mod = require("../../services/authService");
  });
  return mod;
}

beforeEach(() => jest.clearAllMocks());
afterAll(() => {
  delete process.env.EXPO_PUBLIC_AUTH_CANISTER_ID;
});

describe("without an auth canister configured", () => {
  it("getProfile and issueAgentSession return null and call nothing", async () => {
    const svc = load(undefined);
    expect(await svc.getProfile(agent)).toBeNull();
    expect(await svc.issueAgentSession(agent)).toBeNull();
    expect(mockActorFor).not.toHaveBeenCalled();
  });
});

describe("with the auth canister", () => {
  it("getProfile uses the caller's agent and decodes the profile", async () => {
    const svc = load("auth-id");
    mockActor.getProfile.mockResolvedValue({ ok: raw });
    const p = await svc.getProfile(agent);
    expect(mockActorFor).toHaveBeenCalledWith(expect.anything(), "auth-id", agent);
    expect(p).toMatchObject({ principal: "p-1", role: "Contractor", email: "a@b.c" });
  });

  it("getProfile throws a typed error (useAuth turns it into a null profile)", async () => {
    const svc = load("auth-id");
    mockActor.getProfile.mockResolvedValue({ err: { NotFound: null } });
    const err = await svc.getProfile(agent).catch((e: unknown) => e);
    expect(err).toMatchObject({ name: "CanisterError", code: "NotFound" });
  });

  it("issueAgentSession returns the token with expiry converted from ns to ms", async () => {
    const svc = load("auth-id");
    mockActor.issueAgentSession.mockResolvedValue({ ok: { token: "tok", expiresAt: 7_000n * 1_000_000n } });
    expect(await svc.issueAgentSession(agent)).toEqual({ token: "tok", expiresAtMs: 7_000 });
  });

  it("issueAgentSession returns null for an unregistered caller", async () => {
    const svc = load("auth-id");
    mockActor.issueAgentSession.mockResolvedValue({ err: { NotAuthorized: null } });
    expect(await svc.issueAgentSession(agent)).toBeNull();
  });
});
