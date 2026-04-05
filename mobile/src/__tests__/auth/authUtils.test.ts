/**
 * @jest-environment node
 */
import {
  buildIIAuthUrl,
  parseAuthCallback,
  isDelegationExpired,
  II_URL,
  REDIRECT_URI,
} from "../../auth/authUtils";

// ── buildIIAuthUrl ────────────────────────────────────────────────────────────

describe("buildIIAuthUrl", () => {
  const SESSION_KEY = "a1b2c3d4e5f6";

  it("returns a URL string that starts with the II origin", () => {
    const url = buildIIAuthUrl(SESSION_KEY);
    expect(url).toMatch(/^https:\/\/identity\.ic0\.app/);
  });

  it("includes the redirect_uri query param pointing to homegentic://auth", () => {
    const url = buildIIAuthUrl(SESSION_KEY);
    expect(url).toContain("redirect_uri=");
    expect(url).toContain(encodeURIComponent(REDIRECT_URI));
  });

  it("includes the session public key as pubkey param", () => {
    const url = buildIIAuthUrl(SESSION_KEY);
    expect(url).toContain(`pubkey=${SESSION_KEY}`);
  });

  it("includes a maxTimeToLive param expressed in nanoseconds", () => {
    const url = buildIIAuthUrl(SESSION_KEY);
    // maxTimeToLive should be a large number (nanoseconds)
    expect(url).toMatch(/maxTimeToLive=\d+/);
  });

  it("accepts a custom redirectUri override", () => {
    const custom = "myapp://callback";
    const url = buildIIAuthUrl(SESSION_KEY, custom);
    expect(url).toContain(encodeURIComponent(custom));
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
            expiration: expirationNs.toString(),
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

  it("returns true when delegations array is empty", () => {
    const empty = JSON.stringify({ delegations: [], publicKey: "aa" });
    expect(isDelegationExpired(empty)).toBe(true);
  });
});
