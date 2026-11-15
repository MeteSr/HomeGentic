/**
 * @jest-environment node
 */
// X-7 (security review 2026-11-11): the gateway accepts only tokens issued for
// it, keeps its cache short, and never logs a token.
jest.mock("../icp", () => ({ resolveServiceSession: jest.fn() }));

import type { Request } from "express";
import { clearSessionCache, requestPrincipal, SESSION_HEADER } from "../session";
import { resolveServiceSession } from "../icp";

const TOKEN = "hgs_" + "c".repeat(64);

function req(token: string | undefined): Request {
  return {
    body: {},
    header: (name: string) => (name.toLowerCase() === SESSION_HEADER ? token : undefined),
  } as unknown as Request;
}

const saved = { ...process.env };
beforeEach(() => {
  clearSessionCache();
  process.env.CANISTER_ID_AUTH = "auth-id";
});
afterEach(() => {
  process.env = { ...saved };
  jest.useRealTimers();
});

it("asks the auth canister again after a minute", async () => {
  jest.useFakeTimers({ now: 1_000_000 });
  const resolve = jest.fn(async () => "user-1");
  expect(await requestPrincipal(req(TOKEN), resolve)).toBe("user-1");
  await requestPrincipal(req(TOKEN), resolve);
  expect(resolve).toHaveBeenCalledTimes(1);
  jest.setSystemTime(1_000_000 + 61_000);
  await requestPrincipal(req(TOKEN), resolve);
  expect(resolve).toHaveBeenCalledTimes(2);
});

it("never logs the token, and fails closed, when the lookup fails", async () => {
  const spies = (["error", "warn", "log", "info"] as const).map((m) =>
    jest.spyOn(console, m).mockImplementation(() => {}),
  );
  const resolve = jest.fn(async () => {
    throw new Error(`lookup of ${TOKEN} failed`);
  });
  expect(await requestPrincipal(req(TOKEN), resolve)).toBeNull();
  const logged = JSON.stringify(spies.map((s) => s.mock.calls));
  expect(logged).toContain("failed");
  expect(logged).not.toContain(TOKEN);
  spies.forEach((s) => s.mockRestore());
});

describe("X-7: only this service's own tokens", () => {
  it("checks the token with auth.resolveServiceSession, not the voice Worker's lookup", async () => {
    (resolveServiceSession as jest.Mock).mockResolvedValue("user-9");
    expect(await requestPrincipal(req(TOKEN))).toBe("user-9");
    expect(resolveServiceSession).toHaveBeenCalledWith(TOKEN);
  });
});
