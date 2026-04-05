/**
 * @jest-environment node
 */
import { registerToken, getTokensForPrincipal, removeToken } from "../store";

const P1 = "principal-1";
const P2 = "principal-2";
const T1 = "device-token-aaa";
const T2 = "device-token-bbb";

// Reset module between tests so the Map is fresh
beforeEach(() => {
  jest.resetModules();
});

// Re-import a fresh store for each test group
function freshStore() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require("../store");
}

describe("registerToken", () => {
  it("adds a new token for a principal", () => {
    const s = freshStore();
    s.registerToken(P1, T1, "ios");
    expect(s.getTokensForPrincipal(P1)).toHaveLength(1);
    expect(s.getTokensForPrincipal(P1)[0].token).toBe(T1);
  });

  it("updates an existing token (same token, same principal)", () => {
    const s = freshStore();
    s.registerToken(P1, T1, "ios");
    const firstAt = s.getTokensForPrincipal(P1)[0].updatedAt;
    s.registerToken(P1, T1, "ios");
    const secondAt = s.getTokensForPrincipal(P1)[0].updatedAt;
    expect(s.getTokensForPrincipal(P1)).toHaveLength(1);
    expect(secondAt).toBeGreaterThanOrEqual(firstAt);
  });

  it("allows multiple devices for the same principal", () => {
    const s = freshStore();
    s.registerToken(P1, T1, "ios");
    s.registerToken(P1, T2, "android");
    expect(s.getTokensForPrincipal(P1)).toHaveLength(2);
  });

  it("keeps principals isolated", () => {
    const s = freshStore();
    s.registerToken(P1, T1, "ios");
    s.registerToken(P2, T2, "android");
    expect(s.getTokensForPrincipal(P1)).toHaveLength(1);
    expect(s.getTokensForPrincipal(P2)).toHaveLength(1);
  });
});

describe("getTokensForPrincipal", () => {
  it("returns empty array for unknown principal", () => {
    const s = freshStore();
    expect(s.getTokensForPrincipal("nobody")).toEqual([]);
  });
});

describe("removeToken", () => {
  it("removes a known token", () => {
    const s = freshStore();
    s.registerToken(P1, T1, "ios");
    s.removeToken(T1);
    expect(s.getTokensForPrincipal(P1)).toHaveLength(0);
  });

  it("removes the entry entirely when last token is removed", () => {
    const s = freshStore();
    s.registerToken(P1, T1, "ios");
    s.removeToken(T1);
    expect(s.getTokensForPrincipal(P1)).toEqual([]);
  });

  it("only removes the matching token, leaving others intact", () => {
    const s = freshStore();
    s.registerToken(P1, T1, "ios");
    s.registerToken(P1, T2, "android");
    s.removeToken(T1);
    const remaining = s.getTokensForPrincipal(P1);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].token).toBe(T2);
  });

  it("is a no-op for an unknown token", () => {
    const s = freshStore();
    s.registerToken(P1, T1, "ios");
    s.removeToken("nonexistent");
    expect(s.getTokensForPrincipal(P1)).toHaveLength(1);
  });
});
