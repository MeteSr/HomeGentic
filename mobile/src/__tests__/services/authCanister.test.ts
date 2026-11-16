/**
 * @jest-environment node
 *
 * Mobile authService against the auth canister (test-gap audit 2026-11-03,
 * M1): profile fetch on sign-in and the agent-session token the
 * notification relay and the voice Worker accept.
 */

const mockActor = { getProfile: jest.fn(), register: jest.fn(), issueAgentSession: jest.fn(), issueServiceSession: jest.fn() };
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

  it("issueServiceSession asks for a token for that one service", async () => {
    const svc = load("auth-id");
    mockActor.issueServiceSession.mockResolvedValue({ ok: { token: "svc", expiresAt: 9_000n * 1_000_000n } });
    expect(await svc.issueServiceSession(agent, "notifications")).toEqual({ token: "svc", expiresAtMs: 9_000 });
    expect(mockActor.issueServiceSession).toHaveBeenCalledWith({ notifications: null });
  });

  it("issueServiceSession returns null for an unregistered caller or with no canister", async () => {
    mockActor.issueServiceSession.mockResolvedValue({ err: { NotFound: null } });
    expect(await load("auth-id").issueServiceSession(agent, "notifications")).toBeNull();
    mockActor.issueServiceSession.mockClear();
    expect(await load(undefined).issueServiceSession(agent, "notifications")).toBeNull();
    expect(mockActor.issueServiceSession).not.toHaveBeenCalled();
  });

  it("loadProfile says when the caller hasn't signed up yet, apart from other failures", async () => {
    const svc = load("auth-id");
    mockActor.getProfile.mockResolvedValue({ ok: raw });
    expect(await svc.loadProfile(agent)).toMatchObject({ profile: { role: "Contractor" }, needsRegistration: false });
    mockActor.getProfile.mockResolvedValue({ err: { NotFound: null } });
    expect(await svc.loadProfile(agent)).toEqual({ profile: null, needsRegistration: true });
    mockActor.getProfile.mockRejectedValue(new Error("offline"));
    expect(await svc.loadProfile(agent)).toEqual({ profile: null, needsRegistration: false });
  });

  it("register signs the caller up with the role, email and phone they gave", async () => {
    const svc = load("auth-id");
    mockActor.register.mockResolvedValue({ ok: { ...raw, role: { Homeowner: null } } });
    const p = await svc.register(agent, { role: "Homeowner", email: "a@b.c", phone: "" });
    expect(mockActor.register).toHaveBeenCalledWith({ role: { Homeowner: null }, email: "a@b.c", phone: "" });
    expect(p.role).toBe("Homeowner");
  });

  it("register throws the canister's error", async () => {
    const svc = load("auth-id");
    mockActor.register.mockResolvedValue({ err: { InvalidInput: "That email is already in use" } });
    await expect(svc.register(agent, { role: "Homeowner", email: "a@b.c", phone: "" })).rejects.toThrow(/already in use/);
  });
});

describe("loadProfile without an auth canister", () => {
  it("never asks a dev build to sign up", async () => {
    expect(await load(undefined).loadProfile(agent)).toEqual({ profile: null, needsRegistration: false });
  });
});
