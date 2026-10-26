import { describe, it, expect } from "vitest";
import { DelegationChain, Ed25519KeyIdentity } from "@icp-sdk/core/identity";
import { MAX_MOBILE_TTL_NS, MOBILE_REDIRECT_URI, mobileRedirectUrl, parseMobileAuthRequest } from "@/services/mobileAuth";

const toHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

describe("parseMobileAuthRequest", () => {
  const key = Ed25519KeyIdentity.generate();
  const hex = toHex(new Uint8Array(key.getPublicKey().toDer()));

  it("accepts an Ed25519 DER public key", () => {
    const r = parseMobileAuthRequest(`?pubkey=${hex}&maxTimeToLive=3600000000000`);
    expect(r).not.toBeNull();
    expect(toHex(r!.publicKeyDer)).toBe(hex);
    expect(r!.maxTimeToLive).toBe(BigInt(3600000000000));
  });

  it("rejects missing, malformed or non-Ed25519 keys", () => {
    expect(parseMobileAuthRequest("")).toBeNull();
    expect(parseMobileAuthRequest("?pubkey=zz")).toBeNull();
    expect(parseMobileAuthRequest(`?pubkey=${"00".repeat(44)}`)).toBeNull();
  });

  it("defaults to 8 hours and caps the lifetime at 30 days", () => {
    expect(parseMobileAuthRequest(`?pubkey=${hex}`)!.maxTimeToLive).toBe(BigInt(8 * 3600) * BigInt(1e9));
    expect(parseMobileAuthRequest(`?pubkey=${hex}&maxTimeToLive=${"9".repeat(30)}`)!.maxTimeToLive).toBe(MAX_MOBILE_TTL_NS);
  });
});

describe("mobileRedirectUrl", () => {
  it("returns the chain to the app's fixed redirect URI, decodable by the app", async () => {
    const user = Ed25519KeyIdentity.generate();
    const session = Ed25519KeyIdentity.generate();
    const chain = await DelegationChain.create(user, session.getPublicKey(), new Date(Date.now() + 3_600_000));
    const url = mobileRedirectUrl(chain);
    expect(url.startsWith(`${MOBILE_REDIRECT_URI}?`)).toBe(true);

    const params = new URL(url).searchParams;
    const json = JSON.parse(atob(params.get("delegation")!));
    const restored = DelegationChain.fromJSON(json);
    expect(toHex(new Uint8Array(restored.publicKey))).toBe(params.get("pubkey"));
    // The chain's last delegation targets the app's session key.
    expect(json.delegations.at(-1).delegation.pubkey).toBe(toHex(new Uint8Array(session.getPublicKey().toDer())));
  });
});
