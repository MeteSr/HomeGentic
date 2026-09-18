/**
 * ScoreCertPage — real logic worth locking down:
 *   - an invalid/corrupt token shows the "Invalid certificate" state
 *     without attempting an on-chain lookup (tested via the real
 *     parseCertToken round-trip — an unparseable token, not a mocked
 *     failure)
 *   - a valid token without a certId skips the on-chain check entirely
 *     (client-generated certificate)
 *   - a valid token WITH a certId starts in the "Checking…" state,
 *     then resolves to verified or not-found based on verifyCert
 *   - the Certified™ badge only shows when payload.certified is true
 *   - the score breakdown renders real numbers for a Pro tier, but is
 *     blurred with an upgrade prompt for a non-Pro tier
 */

import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import ScoreCertPage from "@/pages/ScoreCertPage";
import { generateCertToken, type CertPayload } from "@/services/scoreService";

const { mockVerifyCert } = vi.hoisted(() => ({ mockVerifyCert: vi.fn() }));
vi.mock("@/services/cert", () => ({ certService: { verifyCert: mockVerifyCert } }));

vi.mock("@/hooks/useBreakpoint", () => ({ useBreakpoint: () => ({ isMobile: false, isTablet: false, isDesktop: true }) }));

function makePayload(overrides: Partial<CertPayload> = {}): CertPayload {
  return {
    address: "123 Main St, Austin, TX", score: 82, grade: "A", certified: false,
    generatedAt: Date.now(),
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

describe("ScoreCertPage — invalid token", () => {
  it("shows the invalid-certificate state for an unparseable token, with no on-chain check", () => {
    renderAt("not-valid-base64-json");
    expect(screen.getByText("Invalid certificate")).toBeInTheDocument();
    expect(mockVerifyCert).not.toHaveBeenCalled();
  });
});

describe("ScoreCertPage — on-chain verification", () => {
  it("skips the on-chain check for a client-generated cert (no certId)", () => {
    const token = generateCertToken(makePayload());
    renderAt(token);
    expect(mockVerifyCert).not.toHaveBeenCalled();
    expect(screen.getByText("Client-generated certificate — not stored on-chain")).toBeInTheDocument();
  });

  it("shows Checking then On-chain verified when verifyCert resolves non-null", async () => {
    mockVerifyCert.mockResolvedValue("some-tx-hash");
    const token = generateCertToken(makePayload({ certId: "cert-42" } as any));
    renderAt(token);

    expect(screen.getByText("Checking on-chain record…")).toBeInTheDocument();
    expect(await screen.findByText("On-chain verified · cert-42")).toBeInTheDocument();
  });

  it("shows a not-found message when verifyCert resolves null", async () => {
    mockVerifyCert.mockResolvedValue(null);
    const token = generateCertToken(makePayload({ certId: "cert-99" } as any));
    renderAt(token);

    expect(await screen.findByText("Cert cert-99 not found on-chain — may be from a local session")).toBeInTheDocument();
  });
});

describe("ScoreCertPage — certified badge", () => {
  it("shows the Certified™ badge when the payload is certified", () => {
    const token = generateCertToken(makePayload({ certified: true }));
    renderAt(token);
    expect(screen.getByText("★ HomeGentic Certified™ — Pre-Inspection Ready")).toBeInTheDocument();
  });

  it("shows the plain verified badge when not certified", () => {
    const token = generateCertToken(makePayload({ certified: false }));
    renderAt(token);
    expect(screen.getByText("Verified HomeGentic Property")).toBeInTheDocument();
  });
});

describe("ScoreCertPage — score breakdown", () => {
  const breakdown = { verifiedJobPts: 30, valuePts: 15, verificationPts: 10, diversityPts: 20 };

  it("shows real numbers for a Pro-tier payload", () => {
    const token = generateCertToken(makePayload({ planTier: "Pro", breakdown } as any));
    renderAt(token);
    expect(screen.getByText("Verified Jobs")).toBeInTheDocument();
    expect(screen.getByText("30")).toBeInTheDocument();
  });

  it("shows the upgrade prompt instead of numbers for a Free-tier payload", () => {
    const token = generateCertToken(makePayload({ planTier: "Free", breakdown } as any));
    renderAt(token);
    expect(screen.getByText("Upgrade to Pro to see breakdown")).toBeInTheDocument();
    expect(screen.queryByText("30")).not.toBeInTheDocument();
  });
});
