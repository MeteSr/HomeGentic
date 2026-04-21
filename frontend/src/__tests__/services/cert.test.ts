import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Stateful mock actor for cert canister ────────────────────────────────────
// issueCert stores payload and returns a CERT-N id.
// verifyCert looks up the stored payload.

let _certCounter = 0;
const _certStore = new Map<string, string>(); // certId → JSON payload

const mockCertActor = {
  issueCert: vi.fn(async (_propertyId: string, payloadJson: string) => {
    _certCounter++;
    const certId = `CERT-${_certCounter}`;
    _certStore.set(certId, payloadJson);
    return certId;
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

import { certService, type IssuedCert } from "@/services/cert";
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
    certService.reset();
  });

  // ── issueCert ──────────────────────────────────────────────────────────────
  describe("issueCert", () => {
    it("returns an object with certId and token", async () => {
      const result = await certService.issueCert("prop-1", makePayload());
      expect(result).toHaveProperty("certId");
      expect(result).toHaveProperty("token");
    });

    it("certId follows the CERT-N format", async () => {
      const result = await certService.issueCert("prop-1", makePayload());
      expect(result.certId).toMatch(/^CERT-\d+$/);
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

    it("certId counter increments across calls", async () => {
      const a = await certService.issueCert("prop-1", makePayload());
      const b = await certService.issueCert("prop-1", makePayload());
      const numA = parseInt(a.certId.replace("CERT-", ""), 10);
      const numB = parseInt(b.certId.replace("CERT-", ""), 10);
      expect(numB).toBeGreaterThan(numA);
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

    it("looking up an unissued id does not affect a valid cert", async () => {
      const { certId } = await certService.issueCert("prop-1", makePayload({ score: 78 }));
      await certService.verifyCert("CERT-0");
      expect((await certService.verifyCert(certId))!.score).toBe(78);
    });
  });
});
