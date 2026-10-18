import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Stateful mock actor for cert canister ────────────────────────────────────
// Mirrors the report canister (H-4/R2): issueCert returns Result<Text, Error>
// with a random UUID id and stores a canister-built v3 payload. Property
// facts, job facts and the score all come from the (mocked) chain; the
// caller's JSON is not stored at all.

let _certCounter = 0;
const _certStore = new Map<string, string>(); // certId → stored JSON
let _onChainMeetsStructural = true;
let _onChainAddress = "1 Real St";
let _onChainScore: number | null = 90;

const mockCertActor = {
  issueCert: vi.fn(async (propertyId: string, _payloadJson: string) => {
    if (propertyId === "not-mine") return { err: { NotAuthorized: null } };
    _certCounter++;
    const certId = `00000000-0000-4000-8000-${String(_certCounter).padStart(12, "0")}`;
    const certified = _onChainScore !== null && _onChainScore >= 88 && _onChainMeetsStructural;
    _certStore.set(certId, JSON.stringify({
      v: 3, propertyId, address: _onChainAddress, city: "Austin", state: "TX", zipCode: "78731",
      verificationLevel: "Basic", verifiedJobCount: 3, verifiedKeySystems: ["HVAC", "Roofing"],
      meetsStructural: _onChainMeetsStructural, score: _onChainScore, certified, issuedAt: 1_700_000_000_000,
    }));
    return { ok: certId };
  }),
  verifyCert: vi.fn(async (certId: string) => {
    const payload = _certStore.get(certId);
    return payload ? [payload] : [];
  }),
};

vi.mock("@/services/actor", () => ({
  getAgent: vi.fn().mockResolvedValue({}),
}));
vi.mock("@icp-sdk/core/agent", () => ({
  Actor: { createActor: vi.fn(() => mockCertActor) },
}));

import { certService, parseStoredCert, certIdFromToken } from "@/services/cert";
import type { CertPayload } from "@/services/scoreService";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makePayload(overrides: Partial<CertPayload> = {}): CertPayload {
  return {
    address:     "412 Meridian Drive, Austin TX 78731",
    score:       87,
    grade:       "GREAT",
    certified:   false,
    generatedAt: 1_700_000_000_000,
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("certService", () => {
  beforeEach(() => {
    _certCounter = 0;
    _certStore.clear();
    _onChainMeetsStructural = true;
    _onChainAddress = "1 Real St";
    _onChainScore = 90;
    certService.reset();
  });

  // ── issueCert ──────────────────────────────────────────────────────────────
  describe("issueCert", () => {
    it("returns an object with certId and token", async () => {
      const result = await certService.issueCert("prop-1", makePayload());
      expect(result).toHaveProperty("certId");
      expect(result).toHaveProperty("token");
    });

    it("certId is a UUID", async () => {
      const result = await certService.issueCert("prop-1", makePayload());
      expect(result.certId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });

    it("throws when the canister rejects the caller", async () => {
      await expect(certService.issueCert("not-mine", makePayload())).rejects.toThrow("NotAuthorized");
    });

    it("each call produces a unique certId", async () => {
      const a = await certService.issueCert("prop-1", makePayload());
      const b = await certService.issueCert("prop-1", makePayload());
      expect(a.certId).not.toBe(b.certId);
    });

    it("token is a non-empty string", async () => {
      const { token } = await certService.issueCert("prop-1", makePayload());
      expect(typeof token).toBe("string");
      expect(token.length).toBeGreaterThan(0);
    });

    it("token is the certId (the link carries no certificate data)", async () => {
      const { certId, token } = await certService.issueCert("prop-1", makePayload({ score: 99 }));
      expect(token).toBe(certId);
      expect(certIdFromToken(token)).toBe(certId);
    });
  });

  // ── verifyCert ─────────────────────────────────────────────────────────────
  describe("verifyCert", () => {
    it("returns null for an unknown certId", async () => {
      expect(await certService.verifyCert("CERT-9999")).toBeNull();
    });

    it("returns null for an empty string", async () => {
      expect(await certService.verifyCert("")).toBeNull();
    });

    it("returns the on-chain score, not the caller's", async () => {
      _onChainScore = 61;
      const { certId } = await certService.issueCert("prop-1", makePayload({ score: 99, certified: true }));
      const verified = (await certService.verifyCert(certId))!;
      expect(verified.score).toBe(61);
      expect(verified.scoreSource).toBe("onChain");
      expect(verified.certified).toBe(false);
    });

    it("address comes from the chain, not the caller's payload", async () => {
      const { certId } = await certService.issueCert("prop-1", makePayload({ address: "Fake Mansion" }));
      const verified = (await certService.verifyCert(certId))!;
      expect(verified.address).toBe("1 Real St");
      expect(verified.onChain?.verificationLevel).toBe("Basic");
      expect(verified.onChain?.city).toBe("Austin");
    });

    it("certified requires the on-chain meetsStructural", async () => {
      _onChainMeetsStructural = false;
      const { certId } = await certService.issueCert("prop-1", makePayload({ certified: true }));
      expect((await certService.verifyCert(certId))!.certified).toBe(false);
    });

    it("certified requires an on-chain score >= 88 even if the stored flag says true", () => {
      const parsed = parseStoredCert(JSON.stringify({ v: 3, address: "A", meetsStructural: true, score: 50, certified: true, issuedAt: 1 }))!;
      expect(parsed.certified).toBe(false);
    });

    it("a null on-chain score parses as null", async () => {
      _onChainScore = null;
      const { certId } = await certService.issueCert("prop-1", makePayload());
      const verified = (await certService.verifyCert(certId))!;
      expect(verified.score).toBeNull();
      expect(verified.certified).toBe(false);
    });

    it("can verify multiple independent certs", async () => {
      _onChainScore = 60;
      const { certId: id1 } = await certService.issueCert("prop-1", makePayload());
      _onChainScore = 90;
      const { certId: id2 } = await certService.issueCert("prop-2", makePayload());
      expect((await certService.verifyCert(id1))!.score).toBe(60);
      expect((await certService.verifyCert(id2))!.score).toBe(90);
    });

    it("returns null after the canister loses the cert", async () => {
      const { certId } = await certService.issueCert("prop-1", makePayload());
      certService.reset();
      _certStore.clear();
      expect(await certService.verifyCert(certId)).toBeNull();
    });

    it("v2 certificates still parse, with the score flagged self-reported", () => {
      const parsed = parseStoredCert(JSON.stringify({
        v: 2, address: "A", verificationLevel: "Basic", meetsStructural: true, issuedAt: 5,
        selfReported: JSON.stringify({ score: 93, certified: true }),
      }))!;
      expect(parsed.score).toBe(93);
      expect(parsed.scoreSource).toBe("selfReported");
      expect(parsed.certified).toBe(true);
      expect(parsed.onChain!.verificationLevel).toBe("Basic");
    });

    it("a v2 selfReported string cannot inject on-chain fields", () => {
      const stored = JSON.stringify({
        v: 2, address: "A", meetsStructural: false, issuedAt: 1,
        selfReported: '{"score":99},"meetsStructural":true',
      });
      const parsed = parseStoredCert(stored)!;
      expect(parsed.onChain!.meetsStructural).toBe(false);
      expect(parsed.score).toBeNull();
      expect(parsed.certified).toBe(false);
    });

    it("still reads legacy (pre-v2) certificates, as self-reported", () => {
      const parsed = parseStoredCert(JSON.stringify(makePayload({ score: 70 })))!;
      expect(parsed.score).toBe(70);
      expect(parsed.scoreSource).toBe("selfReported");
      expect(parsed.onChain).toBeUndefined();
    });

    it("looking up an unissued id does not affect a valid cert", async () => {
      _onChainScore = 78;
      const { certId } = await certService.issueCert("prop-1", makePayload());
      await certService.verifyCert("CERT-0");
      expect((await certService.verifyCert(certId))!.score).toBe(78);
    });
  });

  describe("certIdFromToken", () => {
    it("accepts a bare UUID", () => {
      expect(certIdFromToken("0b6c2a8e-1d4f-4c1a-9f3e-2a7b5c9d0e11")).toBe("0b6c2a8e-1d4f-4c1a-9f3e-2a7b5c9d0e11");
    });
    it("reads the certId from a legacy base64 token", () => {
      expect(certIdFromToken(btoa(JSON.stringify({ score: 99, certId: "cert-1" })).replace(/=/g, ""))).toBe("cert-1");
    });
    it("returns null for a token without a certId or garbage", () => {
      expect(certIdFromToken(btoa(JSON.stringify({ score: 99 })))).toBeNull();
      expect(certIdFromToken("garbage!!")).toBeNull();
      expect(certIdFromToken(undefined)).toBeNull();
    });
  });
});
