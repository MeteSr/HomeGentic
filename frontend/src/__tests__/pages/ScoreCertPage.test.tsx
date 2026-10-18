/**
 * ScoreCertPage — R2: the link only names the certificate; everything shown
 * comes from certService.verifyCert.
 *   - a token naming no certificate shows "Invalid certificate" with no lookup
 *   - a certId token (or a legacy base64 token's certId) is looked up on-chain
 *   - not-found → "Certificate not found"
 *   - found → address, verification level, structural flag and the on-chain
 *     score from the record, never from the link
 *   - v2/legacy certificates show their score as homeowner-reported
 */

import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import ScoreCertPage from "@/pages/ScoreCertPage";
import { generateCertToken } from "@/services/scoreService";
import type { VerifiedCert } from "@/services/cert";

const { mockVerifyCert } = vi.hoisted(() => ({ mockVerifyCert: vi.fn() }));
vi.mock("@/services/cert", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/cert")>();
  return { ...actual, certService: { verifyCert: mockVerifyCert } };
});

vi.mock("@/hooks/useBreakpoint", () => ({ useBreakpoint: () => ({ isMobile: false, isTablet: false, isDesktop: true }) }));

const CERT_ID = "0b6c2a8e-1d4f-4c1a-9f3e-2a7b5c9d0e11";

function onChainCert(overrides: Partial<VerifiedCert> = {}): VerifiedCert {
  return {
    address: "1 Real St", score: 91, scoreSource: "onChain", certified: true,
    generatedAt: 1_700_000_000_000,
    onChain: {
      propertyId: "prop-1", city: "Austin", state: "TX", zipCode: "78731",
      verificationLevel: "Premium", verifiedJobCount: 4,
      verifiedKeySystems: ["HVAC", "Roofing"], meetsStructural: true,
    },
    ...overrides,
  };
}

function renderAt(token: string) {
  return render(
    <MemoryRouter initialEntries={[`/cert/${token}`]}>
      <Routes><Route path="/cert/:token" element={<ScoreCertPage />} /></Routes>
    </MemoryRouter>
  );
}

beforeEach(() => vi.clearAllMocks());

describe("ScoreCertPage — invalid link", () => {
  it("shows the invalid-certificate state for an unparseable token, with no on-chain check", () => {
    renderAt("not-valid-base64-json");
    expect(screen.getByText("Invalid certificate")).toBeInTheDocument();
    expect(mockVerifyCert).not.toHaveBeenCalled();
  });

  it("treats a client-generated token without a certId as invalid", () => {
    renderAt(generateCertToken({ address: "Fake", score: 99, grade: "A+", certified: true, generatedAt: 1 }));
    expect(screen.getByText("Invalid certificate")).toBeInTheDocument();
    expect(mockVerifyCert).not.toHaveBeenCalled();
    expect(screen.queryByText("99")).not.toBeInTheDocument();
  });
});

describe("ScoreCertPage — on-chain lookup", () => {
  it("shows Checking, then the on-chain record for a certId token", async () => {
    mockVerifyCert.mockResolvedValue(onChainCert());
    renderAt(CERT_ID);
    expect(screen.getByText("Checking on-chain record…")).toBeInTheDocument();
    expect(await screen.findByText(`On-chain verified · ${CERT_ID}`)).toBeInTheDocument();
    expect(mockVerifyCert).toHaveBeenCalledWith(CERT_ID);
    expect(screen.getByText("1 Real St")).toBeInTheDocument();
    expect(screen.getByText("Premium")).toBeInTheDocument();
    expect(screen.getByText("Met")).toBeInTheDocument();
    expect(screen.getByText("91")).toBeInTheDocument();
    expect(screen.getByText(/computed on-chain/i)).toBeInTheDocument();
  });

  it("reads only the certId from a legacy base64 token and ignores its payload", async () => {
    mockVerifyCert.mockResolvedValue(onChainCert({ score: 64, certified: false }));
    const token = generateCertToken({ address: "Fake Mansion", score: 99, grade: "A+", certified: true, generatedAt: 1, certId: "cert-42" } as any);
    renderAt(token);
    expect(await screen.findByText("On-chain verified · cert-42")).toBeInTheDocument();
    expect(mockVerifyCert).toHaveBeenCalledWith("cert-42");
    expect(screen.getByText("64")).toBeInTheDocument();
    expect(screen.queryByText("99")).not.toBeInTheDocument();
    expect(screen.queryByText("Fake Mansion")).not.toBeInTheDocument();
    expect(screen.queryByText("★ HomeGentic Certified™ — Pre-Inspection Ready")).not.toBeInTheDocument();
  });

  it("shows Certificate not found when the id is unknown on-chain", async () => {
    mockVerifyCert.mockResolvedValue(null);
    renderAt(CERT_ID);
    expect(await screen.findByText("Certificate not found")).toBeInTheDocument();
  });
});

describe("ScoreCertPage — certified badge and score source", () => {
  it("shows the Certified™ badge when the on-chain record is certified", async () => {
    mockVerifyCert.mockResolvedValue(onChainCert({ certified: true }));
    renderAt(CERT_ID);
    expect(await screen.findByText("★ HomeGentic Certified™ — Pre-Inspection Ready")).toBeInTheDocument();
  });

  it("shows the plain badge when not certified", async () => {
    mockVerifyCert.mockResolvedValue(onChainCert({ certified: false }));
    renderAt(CERT_ID);
    expect(await screen.findByText("HomeGentic Score Certificate")).toBeInTheDocument();
  });

  it("labels a v2/legacy score as homeowner-reported", async () => {
    mockVerifyCert.mockResolvedValue(onChainCert({ scoreSource: "selfReported", score: 80, certified: false }));
    renderAt(CERT_ID);
    expect(await screen.findByText(/homeowner-reported score/i)).toBeInTheDocument();
  });

  it("says so when there is no on-chain score", async () => {
    mockVerifyCert.mockResolvedValue(onChainCert({ score: null, certified: false }));
    renderAt(CERT_ID);
    expect(await screen.findByText(/no on-chain score/i)).toBeInTheDocument();
  });

  it("explains that unverified contractor signatures are not counted", async () => {
    mockVerifyCert.mockResolvedValue(onChainCert());
    renderAt(CERT_ID);
    expect(await screen.findByText(/not yet verified are not counted/i)).toBeInTheDocument();
  });
});
