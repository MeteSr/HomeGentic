/**
 * 15.4.3 → R2: ScoreCertPage no longer shows the client-computed score
 * breakdown. The breakdown (and planTier) travelled in the share link and
 * came from the homeowner's browser; the page now shows only what the report
 * canister returns from verifyCert, with the score computed on-chain.
 */

import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";

const { mockVerifyCert } = vi.hoisted(() => ({ mockVerifyCert: vi.fn() }));
vi.mock("@/services/cert", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/cert")>();
  return { ...actual, certService: { verifyCert: mockVerifyCert } };
});

import { generateCertToken } from "@/services/scoreService";
import ScoreCertPage from "@/pages/ScoreCertPage";

const BREAKDOWN = { verifiedJobPts: 24, valuePts: 12, verificationPts: 10, diversityPts: 16 };

function renderLegacyLink(planTier: string) {
  const token = generateCertToken({
    address: "500 Elm St", score: 92, grade: "A+", certified: true,
    generatedAt: Date.now(), planTier, breakdown: BREAKDOWN, certId: "cert-7",
  } as any);
  render(
    <MemoryRouter initialEntries={[`/cert/${token}`]}>
      <Routes><Route path="/cert/:token" element={<ScoreCertPage />} /></Routes>
    </MemoryRouter>
  );
}

describe("ScoreCertPage — link-embedded data is ignored (R2)", () => {
  it("does not render a link-embedded breakdown for Pro", async () => {
    mockVerifyCert.mockResolvedValue({
      address: "500 Elm St", score: 70, scoreSource: "onChain", certified: false, generatedAt: 1,
    });
    renderLegacyLink("Pro");
    expect(await screen.findByText("70")).toBeInTheDocument();
    expect(screen.queryByText(/score breakdown/i)).not.toBeInTheDocument();
    expect(screen.queryByText("24")).not.toBeInTheDocument();
    expect(screen.queryByText("92")).not.toBeInTheDocument();
  });

  it("shows the not-found state instead of the link's score when the cert is unknown", async () => {
    mockVerifyCert.mockResolvedValue(null);
    renderLegacyLink("Free");
    expect(await screen.findByText("Certificate not found")).toBeInTheDocument();
    expect(screen.queryByText("92")).not.toBeInTheDocument();
  });
});
