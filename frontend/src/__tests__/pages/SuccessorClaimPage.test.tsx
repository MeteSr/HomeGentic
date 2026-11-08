/**
 * SuccessorClaimPage (#724): someone with a successor link asks for the home
 * record by sending a proof document.
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";

const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }));
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useParams: () => ({ token: "tok123" }), useNavigate: () => mockNavigate };
});
const { auth } = vi.hoisted(() => ({ auth: { isAuthenticated: true, isLoading: false, principal: "heir" } }));
vi.mock("@/store/authStore", () => ({ useAuthStore: (sel?: any) => (sel ? sel(auth) : auth) }));

const { svc } = vi.hoisted(() => ({ svc: { getInvite: vi.fn(), openClaim: vi.fn() } }));
vi.mock("@/services/succession", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/succession")>();
  return { ...actual, successionService: { getInvite: svc.getInvite, openClaim: svc.openClaim } };
});

import SuccessorClaimPage from "@/pages/SuccessorClaimPage";

const INVITE = {
  propertyId: "prop-1",
  address: "70 Heritage Way",
  city: "Orlando",
  state: "FL",
  zipCode: "32801",
  successorName: "Jordan Rivera",
  waitDays: 30,
};
const pdf = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], "certificate.pdf", { type: "application/pdf" });

const renderPage = () =>
  render(
    <MemoryRouter>
      <SuccessorClaimPage />
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  auth.isAuthenticated = true;
  svc.getInvite.mockResolvedValue(INVITE);
});

describe("SuccessorClaimPage", () => {
  it("says the link isn't valid when it's unknown", async () => {
    svc.getInvite.mockResolvedValue(null);
    renderPage();
    expect(await screen.findByText(/this successor link isn't valid/i)).toBeInTheDocument();
  });

  it("asks a signed-out visitor to sign in, coming back to the link", async () => {
    auth.isAuthenticated = false;
    renderPage();
    const link = await screen.findByRole("link", { name: /sign in to continue/i });
    expect(link.getAttribute("href")).toBe(`/login?redirect=${encodeURIComponent("/successor/tok123")}`);
    expect(screen.queryByRole("button", { name: /send claim/i })).not.toBeInTheDocument();
  });

  it("shows the home, the rules and what HomeGentic doesn't do", async () => {
    renderPage();
    expect(await screen.findByText(/70 Heritage Way/)).toBeInTheDocument();
    expect(screen.getByText(/Jordan Rivera/)).toBeInTheDocument();
    expect(screen.getByText(/30 days/)).toBeInTheDocument();
    expect(
      screen.getByText(/doesn't transfer the property or act in any estate or probate matter/i),
    ).toBeInTheDocument();
  });

  it("sends the claim with the document and goes to the claim's status", async () => {
    svc.openClaim.mockResolvedValue({ id: "sc-1" });
    renderPage();
    fireEvent.change(await screen.findByLabelText(/your full name/i), { target: { value: "Jordan Rivera" } });
    fireEvent.change(screen.getByLabelText(/document type/i), { target: { value: "LettersOfAdministration" } });
    fireEvent.change(screen.getByLabelText(/note/i), { target: { value: "Dad passed in October." } });
    fireEvent.change(screen.getByLabelText(/^document$/i), { target: { files: [pdf] } });
    fireEvent.click(screen.getByRole("button", { name: /send claim/i }));
    await waitFor(() =>
      expect(svc.openClaim).toHaveBeenCalledWith(
        "tok123",
        { claimantName: "Jordan Rivera", proofKind: "LettersOfAdministration", note: "Dad passed in October." },
        pdf,
      ),
    );
    expect(mockNavigate).toHaveBeenCalledWith("/successor-claims");
  });

  it("refuses a file of the wrong type before sending", async () => {
    renderPage();
    fireEvent.change(await screen.findByLabelText(/your full name/i), { target: { value: "Jordan Rivera" } });
    fireEvent.change(screen.getByLabelText(/^document$/i), {
      target: { files: [new File(["x"], "a.txt", { type: "text/plain" })] },
    });
    expect(await screen.findByText(/Attach a PDF, JPEG or PNG file/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /send claim/i })).toBeDisabled();
  });

  it("shows why the canister refused the claim", async () => {
    svc.openClaim.mockRejectedValue(new Error("A claim is already open on this home"));
    renderPage();
    fireEvent.change(await screen.findByLabelText(/your full name/i), { target: { value: "Jordan Rivera" } });
    fireEvent.change(screen.getByLabelText(/^document$/i), { target: { files: [pdf] } });
    fireEvent.click(screen.getByRole("button", { name: /send claim/i }));
    expect(await screen.findByText("A claim is already open on this home")).toBeInTheDocument();
  });
});
