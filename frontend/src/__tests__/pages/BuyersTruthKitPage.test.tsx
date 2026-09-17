/**
 * BuyersTruthKitPage — real logic worth locking down:
 *   - step-0 validation gates the Next button (address > 5 chars, a
 *     plausible year built)
 *   - Generate posts the address/yearBuilt/claims to the voice-agent API
 *     and shows the results screen on success
 *   - a failed/non-ok fetch shows an error and returns to step 1 (not
 *     back to the landing screen)
 *   - Copy Share Link encodes state into a URL and copies it
 *   - a shared "?d=" URL decodes straight into a running analysis
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import BuyersTruthKitPage from "@/pages/BuyersTruthKitPage";

const DEFAULT_CLAIMS = {
  roof: { status: "unknown" },
  hvacPrimary: { status: "unknown" },
  hvacSecondary: { status: "unknown", present: "unknown" },
  waterHeater: { status: "unknown", kind: "unknown" },
  electrical: { status: "unknown" },
  plumbing: { status: "unknown" },
  windows: { status: "unknown" },
  foundation: { status: "unknown" },
};

function makeKitResponse(overrides: Partial<any> = {}) {
  return {
    property: { address: "123 Main St, Plano, TX 75023", yearBuilt: 1987, geocoded: true },
    permits: { searched: true, found: false, count: 0, records: [], portalUrl: "", portalName: "", instructions: "", note: "" },
    kit: {
      overallRisk: "low",
      overallSummary: "This home looks well maintained.",
      systems: [],
      redFlags: [],
      eraRisks: [],
      generalQuestions: [],
      generalDocuments: [],
    },
    ...overrides,
  };
}

function renderAt(path = "/truth-kit") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <BuyersTruthKitPage />
    </MemoryRouter>
  );
}

async function fillStep0(addr = "123 Main St, Plano, TX 75023", year = "1987") {
  fireEvent.click(screen.getByText("Build My Truth Kit"));
  await waitFor(() => expect(screen.getByText("Tell us about the home.")).toBeInTheDocument());
  fireEvent.change(screen.getByPlaceholderText("123 Main St, Plano, TX 75023"), { target: { value: addr } });
  fireEvent.change(screen.getByPlaceholderText("e.g. 1987"), { target: { value: year } });
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.stubGlobal("fetch", vi.fn());
  vi.stubGlobal("alert", vi.fn());
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
});

describe("BuyersTruthKitPage — step 0 validation", () => {
  it("disables Next until a plausible address and year are entered", async () => {
    renderAt();
    fireEvent.click(screen.getByText("Build My Truth Kit"));
    await waitFor(() => expect(screen.getByText("Tell us about the home.")).toBeInTheDocument());

    const next = screen.getByText("Next: Seller Claims").closest("button")!;
    expect(next).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("123 Main St, Plano, TX 75023"), { target: { value: "123 Main St" } });
    fireEvent.change(screen.getByPlaceholderText("e.g. 1987"), { target: { value: "1987" } });
    expect(next).not.toBeDisabled();
  });

  it("keeps Next disabled for an implausible year (<=1800)", async () => {
    renderAt();
    fireEvent.click(screen.getByText("Build My Truth Kit"));
    await waitFor(() => expect(screen.getByText("Tell us about the home.")).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText("123 Main St, Plano, TX 75023"), { target: { value: "123 Main St, Plano, TX" } });
    fireEvent.change(screen.getByPlaceholderText("e.g. 1987"), { target: { value: "1800" } });

    expect(screen.getByText("Next: Seller Claims").closest("button")).toBeDisabled();
  });

  it("keeps Next disabled for a too-short address", async () => {
    renderAt();
    fireEvent.click(screen.getByText("Build My Truth Kit"));
    await waitFor(() => expect(screen.getByText("Tell us about the home.")).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText("123 Main St, Plano, TX 75023"), { target: { value: "abc" } });
    fireEvent.change(screen.getByPlaceholderText("e.g. 1987"), { target: { value: "1987" } });

    expect(screen.getByText("Next: Seller Claims").closest("button")).toBeDisabled();
  });
});

describe("BuyersTruthKitPage — generate flow", () => {
  it("posts the address, year, and claims to the voice-agent API and shows results on success", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => makeKitResponse() } as any);
    renderAt();
    await fillStep0();
    fireEvent.click(screen.getByText("Next: Seller Claims"));
    await waitFor(() => expect(screen.getByText("What has the seller claimed?")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Generate My Truth Kit"));

    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      "http://localhost:3001/api/buyers-truth-kit",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ address: "123 Main St, Plano, TX 75023", yearBuilt: 1987, claims: DEFAULT_CLAIMS }),
      })
    ));
    await waitFor(() => expect(screen.getByText(/Overall Risk: Low/)).toBeInTheDocument());
  }, 15000);

  it("shows an error and returns to step 1 (not the landing screen) when the fetch fails", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, json: async () => ({ error: "Address not found" }) } as any);
    renderAt();
    await fillStep0();
    fireEvent.click(screen.getByText("Next: Seller Claims"));
    await waitFor(() => expect(screen.getByText("What has the seller claimed?")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Generate My Truth Kit"));

    await waitFor(() => expect(screen.getByText("Address not found")).toBeInTheDocument());
    expect(screen.getByText("What has the seller claimed?")).toBeInTheDocument();
  }, 15000);
});

describe("BuyersTruthKitPage — share link", () => {
  it("copies an encoded share URL to the clipboard", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => makeKitResponse() } as any);
    renderAt();
    await fillStep0();
    fireEvent.click(screen.getByText("Next: Seller Claims"));
    await waitFor(() => expect(screen.getByText("What has the seller claimed?")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Generate My Truth Kit"));
    await waitFor(() => expect(screen.getByText(/Overall Risk: Low/)).toBeInTheDocument());

    fireEvent.click(screen.getByText("Copy Share Link"));

    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining("/truth-kit?d=")
    ));
    expect(window.alert).toHaveBeenCalledWith("Link copied to clipboard!");
  }, 15000);
});

describe("BuyersTruthKitPage — shared-link auto-run", () => {
  it("decodes a '?d=' URL param and runs the analysis automatically", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => makeKitResponse() } as any);
    const encoded = btoa(JSON.stringify({
      address: "456 Oak Ave, Austin, TX 78701", yearBuilt: 1999, claims: DEFAULT_CLAIMS,
    }));

    renderAt(`/truth-kit?d=${encoded}`);

    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      "http://localhost:3001/api/buyers-truth-kit",
      expect.objectContaining({
        body: JSON.stringify({ address: "456 Oak Ave, Austin, TX 78701", yearBuilt: 1999, claims: DEFAULT_CLAIMS }),
      })
    ));
    await waitFor(() => expect(screen.getByText(/Overall Risk: Low/)).toBeInTheDocument());
  }, 15000);
});
