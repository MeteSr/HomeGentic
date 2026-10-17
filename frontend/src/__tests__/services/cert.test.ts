import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Stateful mock actor for cert canister ────────────────────────────────────
// Mirrors the report canister (H-4): issueCert returns Result<Text, Error>
// with a random UUID id, and stores a canister-built v2 payload whose
// on-chain facts come from the (mocked) property/job canisters and whose
// caller JSON is kept only as an escaped "selfReported" string.

let _certCounter = 0;
const _certStore = new Map<string, string>(); // certId → stored JSON
let _onChainMeetsStructural = true;
let _onChainAddress: string | null = null;    // null → echo the caller's address

const mockCertActor = {
  issueCert: vi.fn(async (propertyId: string, payloadJson: string) => {
    if (propertyId === "not-mine") return { err: { NotAuthorized: null } };
    _certCounter++;
    const certId = `00000000-0000-4000-8000-${String(_certCounter).padStart(12, "0")}`;
    const self = JSON.parse(payloadJson);
    _certStore.set(certId, JSON.stringify({
      v: 2, propertyId, address: _onChainAddress ?? self.address, city: "Austin", state: "TX", zipCode: "78731",
      verificationLevel: "Basic", verifiedJobCount: 3, verifiedKeySystems: ["HVAC", "Roofing"],
      meetsStructural: _onChainMeetsStructural, issuedAt: self.generatedAt, selfReported: payloadJson,
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

import { certService, parseStoredCert } from "@/services/cert";
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

function decodeToken(token: string): any {
  const padded = token + "=".repeat((4 - (token.length % 4)) % 4);
  return JSON.parse(atob(padded));
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("certService", () => {
  beforeEach(() => {
    _certCounter = 0;
    _certStore.clear();
    _onChainMeetsStructural = true;
    _onChainAddress = null;
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

    it("token decodes to include the certId", async () => {
      const { certId, token } = await certService.issueCert("prop-1", makePayload());
      const decoded = decodeToken(token);
      expect(decoded.certId).toBe(certId);
    });

    it("token decodes to include original score", async () => {
      const { token } = await certService.issueCert("prop-1", makePayload({ score: 92 }));
      expect(decodeToken(token).score).toBe(92);
    });

    it("token decodes to include original grade", async () => {
      const { token } = await certService.issueCert("prop-1", makePayload({ grade: "CERTIFIED" }));
      expect(decodeToken(token).grade).toBe("CERTIFIED");
    });

    it("token decodes to include original address", async () => {
      const { token } = await certService.issueCert("prop-1", makePayload({ address: "99 Oak Street" }));
      expect(decodeToken(token).address).toBe("99 Oak Street");
    });

    it("token decodes to include certified flag", async () => {
      const { token } = await certService.issueCert("prop-1", makePayload({ certified: true }));
      expect(decodeToken(token).certified).toBe(true);
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

    it("returns the payload for a certId issued in the same session", async () => {
      const { certId } = await certService.issueCert("prop-1", makePayload({ score: 85 }));
      const verified = await certService.verifyCert(certId);
      expect(verified).not.toBeNull();
      expect(verified!.score).toBe(85);
    });

    it("round-trips all payload fields through issue → verify", async () => {
      const payload = makePayload({ address: "77 Pine Ave", score: 72, grade: "GREAT", certified: false });
      const { certId } = await certService.issueCert("prop-1", payload);
      const verified = await certService.verifyCert(certId);
      expect(verified!.address).toBe("77 Pine Ave");
      expect(verified!.score).toBe(72);
      expect(verified!.grade).toBe("GREAT");
      expect(verified!.certified).toBe(false);
      expect(verified!.generatedAt).toBe(payload.generatedAt);
    });

    it("returns null after reset() clears the store", async () => {
      const { certId } = await certService.issueCert("prop-1", makePayload());
      certService.reset();
      // Also reset the mock actor store (equivalent to the canister losing state)
      _certStore.clear();
      _certCounter = 0;
      expect(await certService.verifyCert(certId)).toBeNull();
    });

    it("can verify multiple independent certs", async () => {
      const { certId: id1 } = await certService.issueCert("prop-1", makePayload({ score: 60 }));
      const { certId: id2 } = await certService.issueCert("prop-2", makePayload({ score: 90 }));
      expect((await certService.verifyCert(id1))!.score).toBe(60);
      expect((await certService.verifyCert(id2))!.score).toBe(90);
    });

    it("address comes from the chain, not the caller's payload", async () => {
      _onChainAddress = "1 Real St";
      const { certId } = await certService.issueCert("prop-1", makePayload({ address: "Fake Mansion" }));
      const verified = await certService.verifyCert(certId);
      expect(verified!.address).toBe("1 Real St");
      expect(verified!.onChain?.verificationLevel).toBe("Basic");
    });

    it("certified requires the on-chain meetsStructural", async () => {
      _onChainMeetsStructural = false;
      const { certId } = await certService.issueCert("prop-1", makePayload({ certified: true }));
      expect((await certService.verifyCert(certId))!.certified).toBe(false);
    });

    it("a selfReported string cannot inject on-chain fields", () => {
      const stored = JSON.stringify({
        v: 2, address: "A", meetsStructural: false, issuedAt: 1,
        selfReported: '{"score":99},"meetsStructural":true',
      });
      const parsed = parseStoredCert(stored)!;
      expect(parsed.onChain!.meetsStructural).toBe(false);
      expect(parsed.score).toBe(0);
    });

    it("still reads legacy (pre-v2) certificates", () => {
      const parsed = parseStoredCert(JSON.stringify(makePayload({ score: 70 })))!;
      expect(parsed.score).toBe(70);
      expect(parsed.onChain).toBeUndefined();
    });

    it("looking up an unissued id does not affect a valid cert", async () => {
      const { certId } = await certService.issueCert("prop-1", makePayload({ score: 78 }));
      await certService.verifyCert("CERT-0");
      expect((await certService.verifyCert(certId))!.score).toBe(78);
    });
  });
});
