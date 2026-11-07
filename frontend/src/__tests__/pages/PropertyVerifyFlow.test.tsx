/**
 * The ownership-verification flow under /properties/:id/verify, rendered
 * through the real VerifyLayout (test-gap audit 2026-11-03, M3: none of these
 * pages had unit coverage). The property service is mocked; everything else
 * is the real page.
 */

import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import VerifyLayout from "@/pages/PropertyVerify/VerifyLayout";
import VerifyClaimPage from "@/pages/PropertyVerify/VerifyClaimPage";
import VerifyIdentityPage from "@/pages/PropertyVerify/VerifyIdentityPage";
import VerifyDocumentPage from "@/pages/PropertyVerify/VerifyDocumentPage";
import VerifyStatusPage from "@/pages/PropertyVerify/VerifyStatusPage";
import VerifyExpiredPage from "@/pages/PropertyVerify/VerifyExpiredPage";
import VerifyContestedPage from "@/pages/PropertyVerify/VerifyContestedPage";
import { DocumentUploadZone } from "@/pages/PropertyVerify/components/DocumentUploadZone";
import type { VerifyClaimData } from "@/pages/PropertyVerify/types";

const svc = vi.hoisted(() => ({
  getVerifyStatus: vi.fn(),
  submitVerification: vi.fn(),
  startIdentityCheck: vi.fn(),
  markIdentityCleared: vi.fn(),
}));
const { mockNavigate, toastError } = vi.hoisted(() => ({ mockNavigate: vi.fn(), toastError: vi.fn() }));

vi.mock("@/services/property", () => ({ propertyService: svc }));
vi.mock("@/components/Layout", () => ({ Layout: ({ children }: any) => <div>{children}</div> }));
vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: toastError } }));
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

const HOUR = 3_600_000;
const NOW = Date.now();
const CLAIM: VerifyClaimData = {
  propertyId: "p1",
  address: "412 Elder St",
  city: "Nashville",
  state: "TN",
  verificationLevel: "Unverified",
  claimStartedAt: NOW - HOUR,
  claimWindowEndsAt: NOW + 71 * HOUR,
  identityVerified: false,
  currentStep: "claim",
} as VerifyClaimData;

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/properties/:id/verify" element={<VerifyLayout />}>
          <Route index element={<VerifyClaimPage />} />
          <Route path="identity" element={<VerifyIdentityPage />} />
          <Route path="document" element={<VerifyDocumentPage />} />
          <Route path="status" element={<VerifyStatusPage />} />
          <Route path="expired" element={<VerifyExpiredPage />} />
          <Route path="contested" element={<VerifyContestedPage />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  svc.getVerifyStatus.mockResolvedValue(CLAIM);
});
afterEach(() => vi.useRealTimers());

describe("VerifyLayout", () => {
  it("loads the claim for the route's property, then shows the page", async () => {
    renderAt("/properties/p1/verify");
    expect(screen.getByText("Loading verification status…")).toBeInTheDocument();
    expect(await screen.findByText("Two proofs, one week.")).toBeInTheDocument();
    expect(svc.getVerifyStatus).toHaveBeenCalledWith("p1");
  });

  it("shows the error and retries on Try again", async () => {
    svc.getVerifyStatus.mockRejectedValueOnce(new Error("Canister unavailable"));
    renderAt("/properties/p1/verify");
    expect(await screen.findByText("Canister unavailable")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Two proofs, one week.")).toBeInTheDocument();
    expect(svc.getVerifyStatus).toHaveBeenCalledTimes(2);
  });
});

describe("VerifyClaimPage", () => {
  it("shows both proofs as not started, and each card opens its step", async () => {
    renderAt("/properties/p1/verify");
    await screen.findByText("Two proofs, one week.");
    expect(screen.getByText("Photo identity")).toBeInTheDocument();
    expect(screen.getByText("Ownership document")).toBeInTheDocument();
    expect(screen.getByText(/LEFT/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Start check" }));
    expect(mockNavigate).toHaveBeenCalledWith("/properties/p1/verify/identity");
    fireEvent.click(screen.getByRole("button", { name: "Verify as a representative" }));
    expect(mockNavigate).toHaveBeenCalledWith("/properties/p1/verify/representative");
  });

  it("marks a cleared identity check", async () => {
    svc.getVerifyStatus.mockResolvedValue({ ...CLAIM, identityVerified: true, nameOnId: "Dana R. Whitfield" });
    renderAt("/properties/p1/verify");
    expect(await screen.findByText("Identity confirmed")).toBeInTheDocument();
  });
});

describe("VerifyIdentityPage", () => {
  it("starting the check sends the browser to the Stripe URL with a return link", async () => {
    svc.startIdentityCheck.mockResolvedValue("https://verify.stripe.com/start/abc");
    const assigned: string[] = [];
    const loc = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        ...loc,
        origin: "https://app.example",
        set href(v: string) {
          assigned.push(v);
        },
      },
    });
    try {
      renderAt("/properties/p1/verify/identity");
      fireEvent.click(await screen.findByRole("button", { name: "Start the identity check" }));
      await waitFor(() => expect(assigned).toEqual(["https://verify.stripe.com/start/abc"]));
      expect(svc.startIdentityCheck).toHaveBeenCalledWith(
        "p1",
        "https://app.example/properties/p1/verify/identity?submitted=1",
      );
      expect(screen.getByText("Opening Stripe…")).toBeInTheDocument();
    } finally {
      Object.defineProperty(window, "location", { configurable: true, value: loc });
    }
  });

  it("shows the error when the check can't start", async () => {
    svc.startIdentityCheck.mockRejectedValue(new Error("Stripe Identity isn't set up"));
    renderAt("/properties/p1/verify/identity");
    fireEvent.click(await screen.findByRole("button", { name: "Start the identity check" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Stripe Identity isn't set up");
    expect(screen.getByRole("button", { name: "Start the identity check" })).toBeInTheDocument();
  });

  it("after Stripe's return it polls the claim until the check shows, then goes back", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderAt("/properties/p1/verify/identity?submitted=1");
    expect(await screen.findByText(/Waiting for Stripe to confirm your check/)).toBeInTheDocument();
    svc.getVerifyStatus.mockResolvedValue({ ...CLAIM, identityVerified: true });
    await act(async () => {
      vi.advanceTimersByTime(5_000);
    });
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/properties/p1/verify"));
  });

  it("Back returns to the claim page", async () => {
    renderAt("/properties/p1/verify/identity");
    fireEvent.click(await screen.findByRole("button", { name: "Back" }));
    expect(mockNavigate).toHaveBeenCalledWith("/properties/p1/verify");
  });
});

describe("VerifyDocumentPage", () => {
  const upload = (name = "deed.pdf") =>
    fireEvent.change(document.querySelector('input[type="file"]')!, {
      target: { files: [new File(["%PDF deed"], name, { type: "application/pdf" })] },
    });

  it("submits the chosen document type with the file's SHA-256, then shows the status", async () => {
    svc.getVerifyStatus.mockResolvedValue({ ...CLAIM, identityVerified: true, nameOnId: "Dana R. Whitfield" });
    svc.submitVerification.mockResolvedValue({});
    renderAt("/properties/p1/verify/document");
    const cta = await screen.findByRole("button", { name: "Add a document to continue" });
    expect(cta).toBeDisabled();
    fireEvent.click(screen.getByText("Utility bill"));
    upload();
    expect(await screen.findByText("deed.pdf")).toBeInTheDocument();
    const submit = screen.getByRole("button", { name: "Add a document to continue" });
    await waitFor(() => expect(submit).toBeEnabled());
    fireEvent.click(submit);
    await waitFor(() => expect(svc.submitVerification).toHaveBeenCalled());
    const [pid, method, hash, name] = svc.submitVerification.mock.calls[0];
    expect([pid, method, name]).toEqual(["p1", "UtilityBill", "Dana R. Whitfield"]);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/properties/p1/verify/status"));
  });

  it("shows the canister's error and stays on the page", async () => {
    svc.submitVerification.mockRejectedValue(new Error("Property is already verified"));
    renderAt("/properties/p1/verify/document");
    await screen.findByRole("button", { name: "Add a document to continue" });
    upload();
    await screen.findByText("deed.pdf");
    const submit = screen.getByRole("button", { name: "Add a document to continue" });
    await waitFor(() => expect(submit).toBeEnabled());
    fireEvent.click(submit);
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Property is already verified"));
    expect(mockNavigate).not.toHaveBeenCalledWith("/properties/p1/verify/status");
  });

  it("warns when less than 12 hours are left", async () => {
    svc.getVerifyStatus.mockResolvedValue({ ...CLAIM, claimWindowEndsAt: Date.now() + 3 * HOUR });
    renderAt("/properties/p1/verify/document");
    expect(await screen.findByText(/Less than 12 hours left/)).toBeInTheDocument();
  });
});

describe("VerifyStatusPage", () => {
  it("lists what is done and what is pending", async () => {
    svc.getVerifyStatus.mockResolvedValue({
      ...CLAIM,
      verificationLevel: "PendingReview",
      identityVerified: true,
      identityVerifiedAt: NOW - HOUR,
      verificationDocHash: "a".repeat(64),
      verificationMethod: "DeedRecord",
    });
    renderAt("/properties/p1/verify/status");
    expect(await screen.findByText("Both proofs are in")).toBeInTheDocument();
    expect(screen.getByText("SHA-256 recorded on-chain")).toBeInTheDocument();
    expect(screen.getByText("Cleared via Stripe Identity")).toBeInTheDocument();
  });

  it("shows the identity step as waiting when Stripe hasn't confirmed", async () => {
    renderAt("/properties/p1/verify/status");
    expect(await screen.findByText("Awaiting Stripe confirmation")).toBeInTheDocument();
    expect(screen.getByText("Upload pending")).toBeInTheDocument();
  });
});

describe("VerifyExpiredPage", () => {
  it("explains what the closed window means and lets the owner finish", async () => {
    svc.getVerifyStatus.mockResolvedValue({ ...CLAIM, claimWindowEndsAt: NOW - HOUR });
    renderAt("/properties/p1/verify/expired");
    expect(await screen.findByText("The 7 days are up")).toBeInTheDocument();
    expect(screen.getByText("The address is claimable")).toBeInTheDocument();
    expect(screen.getByText("Nothing you logged is lost")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Start a new claim on 412 Elder St" }));
    expect(mockNavigate).toHaveBeenCalledWith("/properties/p1/verify");
  });
});

describe("VerifyContestedPage", () => {
  it("shows the dispute and the claim's evidence", async () => {
    svc.getVerifyStatus.mockResolvedValue({
      ...CLAIM,
      identityVerified: true,
      verificationMethod: "DeedRecord",
      contestedWithId: "p9",
      conflictWindowEndsAt: NOW + 24 * HOUR,
    });
    renderAt("/properties/p1/verify/contested");
    expect(await screen.findByText("Under dispute")).toBeInTheDocument();
    expect(screen.getByText("Both claims are held for manual review")).toBeInTheDocument();
    expect(screen.queryByText(/evidence window for this dispute .* has expired/)).toBeNull();
  });

  it("says so when the dispute's evidence window has passed", async () => {
    svc.getVerifyStatus.mockResolvedValue({ ...CLAIM, contestedWithId: "p9", conflictWindowEndsAt: NOW - HOUR });
    renderAt("/properties/p1/verify/contested");
    expect(
      await screen.findByText(/evidence window for this dispute over 412 Elder St has expired/),
    ).toBeInTheDocument();
  });
});

describe("DocumentUploadZone", () => {
  it("hashes the chosen file and hands it back", async () => {
    const onFile = vi.fn();
    render(<DocumentUploadZone onFile={onFile} />);
    fireEvent.change(document.querySelector('input[type="file"]')!, {
      target: { files: [new File(["abc"], "a.pdf")] },
    });
    await waitFor(() => expect(onFile).toHaveBeenCalled());
    // SHA-256("abc")
    expect(onFile.mock.calls[0][1]).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("ignores a file over 10 MB", async () => {
    const onFile = vi.fn();
    render(<DocumentUploadZone onFile={onFile} />);
    const big = new File(["x"], "big.pdf");
    Object.defineProperty(big, "size", { value: 11 * 1024 * 1024 });
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [big] } });
    await new Promise((r) => setTimeout(r, 20));
    expect(onFile).not.toHaveBeenCalled();
  });

  it("accepts a dropped file", async () => {
    const onFile = vi.fn();
    render(<DocumentUploadZone onFile={onFile} />);
    fireEvent.drop(screen.getByText("Drop a file or click to browse"), {
      dataTransfer: { files: [new File(["abc"], "drop.pdf")] },
    });
    await waitFor(() => expect(onFile).toHaveBeenCalled());
  });
});
