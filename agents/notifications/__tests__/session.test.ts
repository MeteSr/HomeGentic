/**
 * @jest-environment node
 */
// Registration callers come from auth-canister session tokens, not the body.
jest.mock("../icp", () => ({ resolveAgentSession: jest.fn() }));

import type { Request } from "express";
import { clearSessionCache, requestPrincipal, SESSION_HEADER } from "../session";

const TOKEN = "hgs_" + "a".repeat(64);

function req(token: string | undefined, body: object = {}): Request {
  return {
    body,
    header: (name: string) => (name.toLowerCase() === SESSION_HEADER ? token : undefined),
  } as unknown as Request;
}

const saved = { ...process.env };
beforeEach(() => {
  clearSessionCache();
  process.env.CANISTER_ID_AUTH = "auth-id";
});
afterEach(() => { process.env = { ...saved }; });

describe("requestPrincipal", () => {
  it("resolves a well-formed token through the auth canister", async () => {
    const resolve = jest.fn(async () => "user-1");
    expect(await requestPrincipal(req(TOKEN), resolve)).toBe("user-1");
    expect(resolve).toHaveBeenCalledWith(TOKEN);
  });

  it("ignores the principal in the body", async () => {
    const resolve = jest.fn(async () => "user-1");
    expect(await requestPrincipal(req(TOKEN, { principal: "someone-else" }), resolve)).toBe("user-1");
    expect(await requestPrincipal(req(undefined, { principal: "someone-else" }), resolve)).toBeNull();
  });

  it("rejects malformed tokens without calling the canister", async () => {
    const resolve = jest.fn(async () => "user-1");
    expect(await requestPrincipal(req("hgs_short"), resolve)).toBeNull();
    expect(resolve).not.toHaveBeenCalled();
  });

  it("returns null for an unknown or expired token", async () => {
    expect(await requestPrincipal(req(TOKEN), async () => null)).toBeNull();
  });

  it("fails closed when the canister call throws", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    const resolve = jest.fn(async () => { throw new Error("down"); });
    expect(await requestPrincipal(req(TOKEN), resolve)).toBeNull();
  });

  it("caches positive lookups only", async () => {
    const resolve = jest.fn<Promise<string | null>, [string]>()
      .mockResolvedValueOnce(null)
      .mockResolvedValue("user-1");
    expect(await requestPrincipal(req(TOKEN), resolve)).toBeNull();
    expect(await requestPrincipal(req(TOKEN), resolve)).toBe("user-1");
    expect(await requestPrincipal(req(TOKEN), resolve)).toBe("user-1");
    expect(resolve).toHaveBeenCalledTimes(2);
  });

  it("falls back to the body principal in local dev without an auth canister", async () => {
    delete process.env.CANISTER_ID_AUTH;
    process.env.NODE_ENV = "development";
    expect(await requestPrincipal(req(undefined, { principal: "dev-user" }))).toBe("dev-user");
  });

  it("never falls back in production", async () => {
    delete process.env.CANISTER_ID_AUTH;
    process.env.NODE_ENV = "production";
    const resolve = jest.fn(async () => null);
    expect(await requestPrincipal(req(undefined, { principal: "dev-user" }), resolve)).toBeNull();
  });
});
