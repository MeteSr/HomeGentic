/**
 * SuccessorPage (#724): the owner names who can claim the home record, gets
 * the successor link, and cancels a claim during the 30-day wait.
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import type { SuccessionClaim, Successor } from "@/services/succession";

const { mockUseParams } = vi.hoisted(() => ({ mockUseParams: vi.fn(() => ({ id: "prop-1" })) }));
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useParams: mockUseParams };
});
vi.mock("@/components/Layout", () => ({ Layout: ({ children }: any) => <div>{children}</div> }));
const { mockToast } = vi.hoisted(() => ({ mockToast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("react-hot-toast", () => ({ default: mockToast }));
const { auth } = vi.hoisted(() => ({ auth: { principal: "owner-principal" } }));
vi.mock("@/store/authStore", () => ({ useAuthStore: (sel: any) => sel(auth) }));

const { svc } = vi.hoisted(() => ({
  svc: {
    getProperty: vi.fn(),
    getSuccessor: vi.fn(),
    setSuccessor: vi.fn(),
    removeSuccessor: vi.fn(),
    getOpenClaim: vi.fn(),
    cancelClaim: vi.fn(),
  },
}));
vi.mock("@/services/property", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/property")>();
  return { ...actual, propertyService: { getProperty: svc.getProperty } };
});
vi.mock("@/services/succession", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/succession")>();
  return {
    ...actual,
    successionService: {
      getSuccessor: svc.getSuccessor,
      setSuccessor: svc.setSuccessor,
      removeSuccessor: svc.removeSuccessor,
      getOpenClaim: svc.getOpenClaim,
      cancelClaim: svc.cancelClaim,
    },
  };
});

import SuccessorPage from "@/pages/SuccessorPage";

const SUCCESSOR: Successor = {
  name: "Jordan Rivera",
  email: "jordan@example.com",
  relationship: "Daughter",
  token: "tok123",
  namedAt: 0,
};
const OPENED = Date.UTC(2026, 10, 8);
const CLAIM: SuccessionClaim = {
  id: "sc-1",
  propertyId: "prop-1",
  claimant: "heir",
  claimantName: "Jordan Rivera",
  proofKind: "DeathCertificate",
  fileName: "c.pdf",
  mimeType: "application/pdf",
  proofSize: 10,
  note: "",
  openedAt: OPENED,
  waitEndsAt: OPENED + 30 * 86_400_000,
  status: { tag: "AwaitingReview" },
};

const renderPage = () =>
  render(
    <MemoryRouter>
      <SuccessorPage />
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  auth.principal = "owner-principal";
  svc.getProperty.mockResolvedValue({
    id: "prop-1",
    owner: "owner-principal",
    address: "70 Heritage Way",
    city: "Orlando",
    state: "FL",
  });
  svc.getSuccessor.mockResolvedValue(null);
  svc.getOpenClaim.mockResolvedValue(null);
});

describe("SuccessorPage", () => {
  it("explains the rules and what HomeGentic doesn't do", async () => {
    renderPage();
    expect(await screen.findByRole("heading", { name: /successor/i })).toBeInTheDocument();
    expect(screen.getByText(/30-day wait/i)).toBeInTheDocument();
    expect(
      screen.getByText(/doesn't transfer the property or act in any estate or probate matter/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/HomeGentic doesn't email your successor/i)).toBeInTheDocument();
  });

  it("names a successor and shows the link", async () => {
    svc.setSuccessor.mockResolvedValue(SUCCESSOR);
    renderPage();
    fireEvent.change(await screen.findByLabelText(/^name/i), { target: { value: "Jordan Rivera" } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "jordan@example.com" } });
    fireEvent.change(screen.getByLabelText(/relationship/i), { target: { value: "Daughter" } });
    fireEvent.click(screen.getByRole("button", { name: /save successor/i }));
    await waitFor(() =>
      expect(svc.setSuccessor).toHaveBeenCalledWith("prop-1", {
        name: "Jordan Rivera",
        email: "jordan@example.com",
        relationship: "Daughter",
      }),
    );
    expect(await screen.findByDisplayValue(`${window.location.origin}/successor/tok123`)).toBeInTheDocument();
  });

  it("shows the saved successor, makes a new link and removes it", async () => {
    svc.getSuccessor.mockResolvedValue(SUCCESSOR);
    svc.setSuccessor.mockResolvedValue({ ...SUCCESSOR, token: "tok456" });
    renderPage();
    expect(await screen.findByDisplayValue(`${window.location.origin}/successor/tok123`)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /new link/i }));
    expect(await screen.findByDisplayValue(`${window.location.origin}/successor/tok456`)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /remove successor/i }));
    fireEvent.click(await screen.findByRole("button", { name: /yes, remove/i }));
    await waitFor(() => expect(svc.removeSuccessor).toHaveBeenCalledWith("prop-1"));
  });

  it("shows an open claim and cancels it", async () => {
    svc.getSuccessor.mockResolvedValue(SUCCESSOR);
    svc.getOpenClaim.mockResolvedValue(CLAIM);
    svc.cancelClaim.mockResolvedValue({ ...CLAIM, status: { tag: "Cancelled", at: 1, by: "owner-principal" } });
    renderPage();
    expect(await screen.findByText(/a successor claim is open/i)).toBeInTheDocument();
    expect(screen.getByText(/Waiting for HomeGentic to review the document/i)).toBeInTheDocument();
    expect(screen.getByText(/December 8, 2026/)).toBeInTheDocument();
    // The successor can't be changed while a claim is open.
    expect(screen.queryByRole("button", { name: /new link/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /cancel claim/i }));
    fireEvent.click(await screen.findByRole("button", { name: /yes, cancel it/i }));
    await waitFor(() => expect(svc.cancelClaim).toHaveBeenCalledWith("sc-1"));
    await waitFor(() => expect(screen.queryByText(/a successor claim is open/i)).not.toBeInTheDocument());
  });

  it("lets a co-owner see and cancel a claim, but not name the successor", async () => {
    auth.principal = "co-owner";
    svc.getOpenClaim.mockResolvedValue({ ...CLAIM, status: { tag: "Approved", at: OPENED } });
    renderPage();
    expect(await screen.findByText(/HomeGentic approved the document/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancel claim/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /save successor/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Only the owner can name a successor/i)).toBeInTheDocument();
  });

  it("shows a canister error when saving fails", async () => {
    svc.setSuccessor.mockRejectedValue(new Error("Enter a valid email address"));
    renderPage();
    fireEvent.change(await screen.findByLabelText(/^name/i), { target: { value: "J" } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "bad" } });
    fireEvent.click(screen.getByRole("button", { name: /save successor/i }));
    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith("Enter a valid email address"));
  });
});
