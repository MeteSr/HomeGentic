import {
  issueTicket, consumeTicket, bindState, takeStateIntent, openPickSession, checkPick,
  isLinkPlatform, PLATFORM_SOURCE, resetDeviceLinkState,
} from "../deviceLink";
import { requestPrincipal, clearSessionCache } from "../session";

const ALICE = "aaaaa-aa";
const intent = { principal: ALICE, propertyId: "PROP_1", platform: "ecobee" };
const devices = [
  { id: "therm-1", name: "Hall", type: "Thermostat" },
  { id: "therm-2", name: "Den", type: "Thermostat" },
];

beforeEach(() => resetDeviceLinkState());

describe("device link tickets", () => {
  it("maps the four picker platforms to canister sources", () => {
    expect(PLATFORM_SOURCE).toEqual({ ecobee: "Ecobee", honeywell: "HoneywellHome", lgthinq: "LGThinQ", ge: "GESmartHQ" });
    expect(isLinkPlatform("nest")).toBe(false);
    expect(isLinkPlatform("__proto__")).toBe(false);
  });

  it("is single use and platform-bound", () => {
    const t = issueTicket(intent);
    expect(consumeTicket(t, "honeywell")).toBeNull();     // wrong platform burns it
    expect(consumeTicket(t, "ecobee")).toBeNull();
    const t2 = issueTicket(intent);
    expect(consumeTicket(t2, "ecobee")).toEqual(intent);
    expect(consumeTicket(t2, "ecobee")).toBeNull();
  });

  it("rejects malformed tickets", () => {
    expect(consumeTicket(undefined, "ecobee")).toBeNull();
    expect(consumeTicket("abc", "ecobee")).toBeNull();
  });

  it("binds an OAuth state to the intent once", () => {
    bindState("s1", intent);
    expect(takeStateIntent("s1")).toEqual(intent);
    expect(takeStateIntent("s1")).toBeNull();
  });
});

describe("pick sessions", () => {
  it("only allows devices the vendor listed, for the principal that started the flow", () => {
    const pt = openPickSession(intent, "", devices);
    const ok = checkPick(pt, ALICE, "therm-2");
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.device.name).toBe("Den");
      expect(ok.session.propertyId).toBe("PROP_1");
    }
    expect(checkPick(pt, ALICE, "victim-thermostat")).toMatchObject({ ok: false, status: 403 });
    expect(checkPick(pt, "2vxsx-fae", "therm-1")).toMatchObject({ ok: false, status: 403 });
    expect(checkPick("f".repeat(64), ALICE, "therm-1")).toMatchObject({ ok: false, status: 410 });
    expect(checkPick("nope", ALICE, "therm-1")).toMatchObject({ ok: false, status: 400 });
  });
});

describe("requestPrincipal", () => {
  const OLD = { ...process.env };
  afterEach(() => { process.env = { ...OLD }; clearSessionCache(); });
  const req = (headers: Record<string, string>, body: unknown = {}) =>
    ({ body, header: (n: string) => headers[n.toLowerCase()] }) as any;
  const TOKEN = "hgs_" + "a".repeat(64);

  it("resolves x-agent-session through the auth canister and ignores the body", async () => {
    process.env.CANISTER_ID_AUTH = "rrkah-fqaaa-aaaaa-aaaaq-cai";
    const resolve = jest.fn().mockResolvedValue(ALICE);
    expect(await requestPrincipal(req({ "x-agent-session": TOKEN }, { principal: "evil" }), resolve)).toBe(ALICE);
    expect(resolve).toHaveBeenCalledWith(TOKEN);
  });

  it("fails closed on a missing, malformed or unknown token", async () => {
    process.env.CANISTER_ID_AUTH = "rrkah-fqaaa-aaaaa-aaaaq-cai";
    const resolve = jest.fn().mockResolvedValue(null);
    expect(await requestPrincipal(req({}, { principal: ALICE }), resolve)).toBeNull();
    expect(await requestPrincipal(req({ "x-agent-session": "bad" }), resolve)).toBeNull();
    expect(await requestPrincipal(req({ "x-agent-session": TOKEN }), resolve)).toBeNull();
    const boom = jest.fn().mockRejectedValue(new Error("down"));
    expect(await requestPrincipal(req({ "x-agent-session": "hgs_" + "b".repeat(64) }), boom)).toBeNull();
  });

  it("never trusts the body principal in production", async () => {
    delete process.env.CANISTER_ID_AUTH;
    process.env.NODE_ENV = "production";
    expect(await requestPrincipal(req({}, { principal: ALICE }), jest.fn())).toBeNull();
  });
});
