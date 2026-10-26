/**
 * ContractorPro pieces: the DBPR licence wording, the earnings view's month
 * buckets and CSV, and the portfolio's public section and Free upsell.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { licenseCheckSummary, licenseCheckSource, looksLikeFlLicense, normLicense } from "@/components/LicenseCheck";
import { earningsByMonth, earningsCsv } from "@/components/EarningsView";
import { FeaturedWork, PortfolioEditor } from "@/components/ContractorPortfolio";
import type { LicenseCheck } from "@/services/contractor";
import type { Quote } from "@/services/quote";

const CHECK: LicenseCheck = {
  licenseNumber: "CGC1234567", found: true, licenseeName: "SMITH, JOHN A", dbaName: "SMITH BUILDERS LLC",
  licenseType: "Certified General Contractor", status: "Current, Active", active: true,
  expiresOn: "2026-08-31", nameMatches: true, sourceDate: "2026-10-20", checkedAt: Date.UTC(2026, 9, 26),
};

describe("licence check wording", () => {
  it("repeats what DBPR's file says", () => {
    expect(licenseCheckSummary(CHECK)).toBe("DBPR lists CGC1234567 as Current, Active, expiring 2026-08-31.");
    expect(licenseCheckSource(CHECK)).toBe("Checked 2026-10-26 against DBPR's licensee file dated 2026-10-20.");
  });

  it("says when the licence is in someone else's name", () => {
    expect(licenseCheckSummary({ ...CHECK, nameMatches: false })).toContain("It's licensed to SMITH, JOHN A (SMITH BUILDERS LLC), not the name on this profile.");
  });

  it("never calls a missing number fake", () => {
    const s = licenseCheckSummary({ ...CHECK, found: false });
    expect(s).toBe("CGC1234567 isn't in DBPR's file of current Florida construction licences.");
    expect(s).not.toMatch(/fake|invalid|unlicensed/i);
  });

  it("recognises Florida licence numbers", () => {
    expect(normLicense("cgc-123 4567")).toBe("CGC1234567");
    expect(looksLikeFlLicense("EC13001234")).toBe(true);
    expect(looksLikeFlLicense("TX-HVAC-12345")).toBe(false);
  });
});

const bid = (over: Partial<Quote>): Quote => ({
  id: "q", requestId: "r", contractor: "c", amount: 100_00, timeline: 3, validUntil: 0, status: "accepted", createdAt: 0, ...over,
});

describe("earnings view", () => {
  const now = new Date(2026, 9, 15);
  const bids = [
    bid({ id: "a", amount: 1500_00, createdAt: new Date(2026, 9, 2).getTime() }),
    bid({ id: "b", amount: 500_00,  createdAt: new Date(2026, 9, 9).getTime() }),
    bid({ id: "c", amount: 900_00,  createdAt: new Date(2026, 7, 9).getTime() }),
    bid({ id: "d", amount: 700_00,  createdAt: new Date(2026, 9, 9).getTime(), status: "rejected" }),
    bid({ id: "e", amount: 800_00,  createdAt: new Date(2025, 8, 9).getTime() }),   // older than 12 months
  ];

  it("totals accepted bids per month for the last 12 months", () => {
    const m = earningsByMonth(bids, now);
    expect(m).toHaveLength(12);
    expect(m[0]).toEqual({ month: "2026-10", count: 2, totalCents: 2000_00 });
    expect(m[1]).toEqual({ month: "2026-09", count: 0, totalCents: 0 });
    expect(m[2]).toEqual({ month: "2026-08", count: 1, totalCents: 900_00 });
    expect(m[11].month).toBe("2025-11");
    expect(m.reduce((s, x) => s + x.count, 0)).toBe(3);
  });

  it("exports every accepted bid as CSV, newest first", () => {
    const lines = earningsCsv(bids).trim().split("\n");
    expect(lines[0]).toBe("date_sent,request_id,quote_id,amount_usd,timeline_days");
    expect(lines).toHaveLength(5);
    expect(lines[1]).toContain(",b,500.00,3");
    expect(lines[2]).toContain(",a,1500.00,3");
    expect(lines.some((l) => l.includes(",d,"))).toBe(false);
  });
});

describe("portfolio", () => {
  it("shows featured work with the trade and co-signed month", () => {
    render(<FeaturedWork items={[{ credentialId: 1, title: "Whole-home repipe", description: "PEX throughout.", serviceType: "Plumbing", verifiedAt: new Date(2026, 4, 3).getTime(), featuredAt: 0 }]} />);
    expect(screen.getByText("Whole-home repipe")).toBeInTheDocument();
    expect(screen.getByText("Plumbing · co-signed May 2026")).toBeInTheDocument();
  });

  it("renders nothing with no featured jobs", () => {
    const { container } = render(<FeaturedWork items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("tells Contractor Free what ContractorPro adds", () => {
    render(<MemoryRouter><PortfolioEditor contractorId="c" isPro={false} /></MemoryRouter>);
    expect(screen.getByTestId("portfolio-upsell")).toHaveTextContent("With ContractorPro you can feature your co-signed jobs");
  });
});
