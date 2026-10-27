/**
 * @jest-environment node
 */
import {
  buildIIAuthUrl,
  parseAuthCallback,
  isDelegationExpired,
  delegationTargetsKey,
  AUTH_BRIDGE_URL,
  REDIRECT_URI,
  delegationExpiryMs,
} from "../../auth/authUtils";

// ── buildIIAuthUrl ────────────────────────────────────────────────────────────

describe("buildIIAuthUrl", () => {
  const SESSION_KEY = "a1b2c3d4e5f6";

  it("opens the web app's sign-in bridge, not Internet Identity directly", () => {
    const url = buildIIAuthUrl(SESSION_KEY);
    expect(url.startsWith(`${AUTH_BRIDGE_URL}?`)).toBe(true);
    expect(AUTH_BRIDGE_URL).toMatch(/^https:\/\/.+\/mobile-auth$/);
  });

  it("does not let the URL choose where the delegation is sent", () => {
    expect(buildIIAuthUrl(SESSION_KEY)).not.toContain("redirect_uri");
    expect(REDIRECT_URI).toBe("homegentic://auth");
  });

  it("includes the session public key as pubkey param", () => {
    const url = buildIIAuthUrl(SESSION_KEY);
    expect(url).toContain(`pubkey=${SESSION_KEY}`);
  });

  it("includes a maxTimeToLive param expressed in nanoseconds", () => {
    expect(buildIIAuthUrl(SESSION_KEY)).toMatch(/maxTimeToLive=\d+/);
  });

  it("accepts a custom bridge URL", () => {
    expect(buildIIAuthUrl(SESSION_KEY, "http://localhost:3000/mobile-auth")).toMatch(/^http:\/\/localhost:3000\/mobile-auth\?/);
  });
});

// ── parseAuthCallback ─────────────────────────────────────────────────────────

describe("parseAuthCallback", () => {
  const DELEGATION_JSON = JSON.stringify({
    delegations: [
      {
        delegation: {
          pubkey: "aabbcc",
          expiration: "17000000000000000",
        },
        signature: "ddeeff",
      },
    ],
    publicKey: "aabbcc",
  });

  const validUrl = `homegentic://auth?delegation=${encodeURIComponent(
    btoa(DELEGATION_JSON)
  )}&pubkey=aabbcc`;

  it("returns an object with delegationChain and userPublicKey for a valid callback URL", () => {
    const result = parseAuthCallback(validUrl);
    expect(result).not.toBeNull();
    expect(result!.delegationChainJSON).toBe(DELEGATION_JSON);
    expect(result!.userPublicKey).toBe("aabbcc");
  });

  it("returns null when delegation param is missing", () => {
    expect(parseAuthCallback("homegentic://auth?pubkey=aabbcc")).toBeNull();
  });

  it("returns null when pubkey param is missing", () => {
    const url = `homegentic://auth?delegation=${encodeURIComponent(btoa(DELEGATION_JSON))}`;
    expect(parseAuthCallback(url)).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(parseAuthCallback("")).toBeNull();
  });

  it("returns null when base64 delegation is malformed", () => {
    expect(parseAuthCallback("homegentic://auth?delegation=!!!invalid&pubkey=aa")).toBeNull();
  });

  it("returns null when decoded delegation is not valid JSON", () => {
    const badBase64 = btoa("not-json{{{");
    expect(parseAuthCallback(`homegentic://auth?delegation=${encodeURIComponent(badBase64)}&pubkey=aa`)).toBeNull();
  });
});

// ── isDelegationExpired ───────────────────────────────────────────────────────

describe("isDelegationExpired", () => {
  function makeDelegationJSON(expirationNs: bigint) {
    return JSON.stringify({
      delegations: [
        {
          delegation: {
            pubkey: "aa",
            // DelegationChain.toJSON() writes hex without a 0x prefix
            expiration: expirationNs.toString(16),
          },
          signature: "bb",
        },
      ],
      publicKey: "aa",
    });
  }

  it("returns true when the delegation expiration is in the past", () => {
    // 1 nanosecond after Unix epoch — definitely expired
    const expired = makeDelegationJSON(BigInt(1_000_000));
    expect(isDelegationExpired(expired)).toBe(true);
  });

  it("returns false when the delegation expiration is far in the future", () => {
    // current time + 8 hours in nanoseconds
    const futureNs = BigInt(Date.now()) * BigInt(1_000_000) + BigInt(8 * 60 * 60) * BigInt(1_000_000_000);
    const valid = makeDelegationJSON(futureNs);
    expect(isDelegationExpired(valid)).toBe(false);
  });

  it("returns true for malformed JSON", () => {
    expect(isDelegationExpired("not-json")).toBe(true);
  });

  it("reads hex expirations that contain letters", () => {
    // 0x18b... style values are what real chains carry; decimal parsing used to throw
    const futureNs = BigInt(Date.now() + 3_600_000) * BigInt(1_000_000);
    expect(futureNs.toString(16)).toMatch(/[a-f]/);
    expect(isDelegationExpired(makeDelegationJSON(futureNs))).toBe(false);
  });

  it("uses the earliest expiration in a multi-delegation chain", () => {
    const soon = BigInt(Date.now() + 60_000) * BigInt(1_000_000);
    const later = BigInt(Date.now() + 8 * 3_600_000) * BigInt(1_000_000);
    const json = JSON.stringify({
      delegations: [
        { delegation: { pubkey: "aa", expiration: later.toString(16) }, signature: "bb" },
        { delegation: { pubkey: "cc", expiration: soon.toString(16) }, signature: "dd" },
      ],
      publicKey: "aa",
    });
    expect(delegationExpiryMs(json)).toBe(Number(soon / BigInt(1_000_000)));
    expect(isDelegationExpired(json)).toBe(false);
    expect(isDelegationExpired(json, Date.now(), 5 * 60_000)).toBe(true);
  });

  it("returns true when delegations array is empty", () => {
    const empty = JSON.stringify({ delegations: [], publicKey: "aa" });
    expect(isDelegationExpired(empty)).toBe(true);
  });
});

// ── delegationTargetsKey ──────────────────────────────────────────────────────

describe("delegationTargetsKey", () => {
  const chain = (pubkeys: string[]) =>
    JSON.stringify({
      delegations: pubkeys.map((pubkey) => ({ delegation: { pubkey, expiration: "1" }, signature: "00" })),
      publicKey: "ff",
    });

  it("accepts a chain whose last delegation targets the session key", () => {
    expect(delegationTargetsKey(chain(["11", "AbCd"]), "abcd")).toBe(true);
  });

  it("rejects a chain delegated to a different key", () => {
    expect(delegationTargetsKey(chain(["abcd", "1234"]), "abcd")).toBe(false);
  });

  it("rejects empty or malformed chains", () => {
    expect(delegationTargetsKey(chain([]), "abcd")).toBe(false);
    expect(delegationTargetsKey("not json", "abcd")).toBe(false);
  });
});
