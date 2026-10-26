/**
 * VerifyRepresentativePage — the step used to be a timer that toasted
 * "Sent for manual review" without sending anything. It must submit the
 * authorisation document's hash and the relationship to the property canister.
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import VerifyRepresentativePage from "@/pages/PropertyVerify/VerifyRepresentativePage";

const { mockNavigate, mockSubmit, mockRefresh, mockToastSuccess, mockToastError } = vi.hoisted(() => ({
  mockNavigate:     vi.fn(),
  mockSubmit:       vi.fn(),
  mockRefresh:      vi.fn(),
  mockToastSuccess: vi.fn(),
  mockToastError:   vi.fn(),
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});
vi.mock("@/services/property", () => ({ propertyService: { submitVerification: mockSubmit } }));
vi.mock("@/components/Layout", () => ({ Layout: ({ children }: any) => <div>{children}</div> }));
vi.mock("react-hot-toast", () => ({ default: { success: mockToastSuccess, error: mockToastError } }));
vi.mock("@/pages/PropertyVerify/VerifyLayout", () => ({
  useVerifyContext: () => ({ claim: { nameOnDocument: "Smith Family Trust", nameOnId: "Jane Smith" }, refresh: mockRefresh }),
}));
vi.mock("@/pages/PropertyVerify/components/DocumentUploadZone", () => ({
  DocumentUploadZone: ({ onFile }: any) => (
    <button onClick={() => onFile(new File(["trust"], "trust.pdf"), "abc123hash")}>pick file</button>
  ),
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/properties/p1/verify/representative"]}>
      <Routes>
        <Route path="/properties/:id/verify/representative" element={<VerifyRepresentativePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("VerifyRepresentativePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSubmit.mockResolvedValue({});
    mockRefresh.mockResolvedValue(undefined);
  });

  it("submits the document hash and relationship, then goes to the status page", async () => {
    renderPage();
    fireEvent.click(screen.getByLabelText(/Trustee of a trust/i));
    fireEvent.click(screen.getByText("pick file"));
    fireEvent.click(screen.getByRole("button", { name: /submit|send/i }));

    await waitFor(() => expect(mockSubmit).toHaveBeenCalledWith("p1", "Representative:trustee", "abc123hash", "Smith Family Trust"));
    expect(mockRefresh).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith("/properties/p1/verify/status");
    expect(mockToastSuccess).toHaveBeenCalled();
  });

  it("shows the error and stays on the page when the canister rejects", async () => {
    mockSubmit.mockRejectedValue(new Error("Property is already verified"));
    renderPage();
    fireEvent.click(screen.getByLabelText(/Power of attorney/i));
    fireEvent.click(screen.getByText("pick file"));
    fireEvent.click(screen.getByRole("button", { name: /submit|send/i }));

    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith("Property is already verified"));
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(mockToastSuccess).not.toHaveBeenCalled();
  });
});
