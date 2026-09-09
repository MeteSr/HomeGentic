/**
 * TDD — 15.4.3: ScoreCertPage — score breakdown gating
 *
 *   Pro+ cert tokens include a breakdown object and planTier.
 *   Free certs still show the score number and grade, but the
 *   sub-score breakdown is blurred and replaced with an upgrade prompt.
 */

import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/services/cert", () => ({
  certService: { verifyCert: vi.fn().mockResolvedValue(null) },
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

import { generateCertToken } from "@/services/scoreService";
import ScoreCertPage from "@/pages/ScoreCertPage";

const BREAKDOWN = { verifiedJobPts: 24, valuePts: 12, verificationPts: 10, diversityPts: 16 };

function makeToken(planTier: string) {
  return generateCertToken({
    address:     "500 Elm St",
    score:       92,
    grade:       "A+",
    certified:   true,
    generatedAt: Date.now(),
    planTier,
    breakdown:   BREAKDOWN,
  } as any);
}

function renderCert(planTier: string) {
  const token = makeToken(planTier);
  render(
    <MemoryRouter initialEntries={[`/cert/${token}`]}>
      <Routes>
        <Route path="/cert/:token" element={<ScoreCertPage />} />
      </Routes>
    </MemoryRouter>
  );
}

// ─── Tests: Pro breakdown visible ─────────────────────────────────────────────

describe("ScoreCertPage — Pro cert shows full breakdown (15.4.3)", () => {
  it("shows a 'Score Breakdown' section for Pro", () => {
    renderCert("Pro");
    expect(screen.getByText(/score breakdown/i)).toBeInTheDocument();
  });

  it("shows 'Verified Jobs' pillar label for Pro", () => {
    renderCert("Pro");
    expect(screen.getByText(/verified jobs/i)).toBeInTheDocument();
  });

  it("shows 'Total Value' pillar label for Pro", () => {
    renderCert("Pro");
    expect(screen.getByText(/total value/i)).toBeInTheDocument();
  });

  it("shows 'Verification' pillar label for Pro", () => {
    renderCert("Pro");
    expect(screen.getByText(/verification/i)).toBeInTheDocument();
  });

  it("shows 'Job Diversity' pillar label for Pro", () => {
    renderCert("Pro");
    expect(screen.getByText(/job diversity/i)).toBeInTheDocument();
  });

  it("shows the verifiedJobPts value for Pro", () => {
    renderCert("Pro");
    expect(screen.getByText("24")).toBeInTheDocument();
  });

  it("does NOT show an upgrade prompt for Pro", () => {
    renderCert("Pro");
    expect(screen.queryByText(/upgrade.*see breakdown|unlock.*breakdown/i)).not.toBeInTheDocument();
  });
});

describe("ScoreCertPage — Premium cert shows full breakdown (15.4.3)", () => {
  it("shows a 'Score Breakdown' section for Premium", () => {
    renderCert("Premium");
    expect(screen.getByText(/score breakdown/i)).toBeInTheDocument();
  });

  it("shows the breakdown points for Premium", () => {
    renderCert("Premium");
    expect(screen.getByText("24")).toBeInTheDocument();
  });
});

// ─── Tests: Free — blurred breakdown + upgrade prompt ────────────────────────

describe("ScoreCertPage — Free cert shows blurred breakdown (15.4.3)", () => {
  it("still shows the score number for Free", () => {
    renderCert("Free");
    expect(screen.getByText("92")).toBeInTheDocument();
  });

  it("shows 'Score Breakdown' section heading for Free", () => {
    renderCert("Free");
    expect(screen.getByText(/score breakdown/i)).toBeInTheDocument();
  });

  it("shows an upgrade prompt for Free", () => {
    renderCert("Free");
    expect(screen.getAllByText(/upgrade.*pro|unlock.*breakdown|see.*breakdown/i).length).toBeGreaterThan(0);
  });

  it("does NOT show actual breakdown point values for Free", () => {
    renderCert("Free");
    // 24 is the verifiedJobPts — should not be visible in the clear
    expect(screen.queryByText("24")).not.toBeInTheDocument();
  });
});

// ─── Tests: legacy token (no planTier / no breakdown) ────────────────────────

describe("ScoreCertPage — legacy token without planTier (15.4.3)", () => {
  it("renders without crashing for a legacy token (no planTier)", () => {
    const legacyToken = generateCertToken({
      address:     "Old House",
      score:       75,
      grade:       "B",
      certified:   false,
      generatedAt: Date.now(),
    });
    render(
      <MemoryRouter initialEntries={[`/cert/${legacyToken}`]}>
        <Routes>
          <Route path="/cert/:token" element={<ScoreCertPage />} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText("75")).toBeInTheDocument();
  });
});
