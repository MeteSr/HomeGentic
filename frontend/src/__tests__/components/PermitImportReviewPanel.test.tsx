/**
 * PermitImportReviewPanel — real logic worth locking down:
 *   - the header pluralizes "permit(s)" based on count
 *   - all permits start checked/included; unchecking one excludes it
 *     from both the confirm-button count and the confirmed payload
 *   - Add to History is disabled once every permit is unchecked, and
 *     stays enabled with at least one still checked
 *   - Skip calls onDismissAll regardless of checkbox state
 *   - the estimated cost only renders when estimatedValueCents is set
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import PermitImportReviewPanel from "@/components/PermitImportReviewPanel";
import type { ImportedPermit } from "@/services/permitImport";

function makePermit(overrides: Partial<ImportedPermit["permit"]> = {}, serviceType = "Roofing"): ImportedPermit {
  return {
    permit: {
      permitNumber: "P-1001", permitType: "Roofing Permit", description: "Roof replacement",
      issuedDate: "2023-05-01", status: "Finaled",
      ...overrides,
    },
    serviceType,
    jobInput: {} as any,
  };
}

describe("PermitImportReviewPanel — header", () => {
  it("pluralizes the permit count", () => {
    render(<PermitImportReviewPanel permits={[makePermit(), makePermit({ permitNumber: "P-1002" })]} onConfirm={vi.fn()} onDismissAll={vi.fn()} />);
    expect(screen.getByText("2 permits found for this address")).toBeInTheDocument();
  });

  it("uses singular wording for exactly one permit", () => {
    render(<PermitImportReviewPanel permits={[makePermit()]} onConfirm={vi.fn()} onDismissAll={vi.fn()} />);
    expect(screen.getByText("1 permit found for this address")).toBeInTheDocument();
  });
});

describe("PermitImportReviewPanel — checkbox inclusion", () => {
  it("starts with all permits checked and included in the confirm count", () => {
    render(<PermitImportReviewPanel permits={[makePermit(), makePermit({ permitNumber: "P-1002" })]} onConfirm={vi.fn()} onDismissAll={vi.fn()} />);
    expect(screen.getByLabelText("add to history")).toHaveTextContent("Add 2 to History");
  });

  it("excludes an unchecked permit from the count and the confirm payload", () => {
    const onConfirm = vi.fn();
    const permits = [makePermit(), makePermit({ permitNumber: "P-1002" }, "Plumbing")];
    render(<PermitImportReviewPanel permits={permits} onConfirm={onConfirm} onDismissAll={vi.fn()} />);

    fireEvent.click(screen.getByLabelText("include permit P-1001"));
    expect(screen.getByLabelText("add to history")).toHaveTextContent("Add 1 to History");

    fireEvent.click(screen.getByLabelText("add to history"));
    expect(onConfirm).toHaveBeenCalledWith([permits[1]]);
  });

  it("re-including a permit restores it to the count", () => {
    render(<PermitImportReviewPanel permits={[makePermit()]} onConfirm={vi.fn()} onDismissAll={vi.fn()} />);
    const checkbox = screen.getByLabelText("include permit P-1001");
    fireEvent.click(checkbox);
    fireEvent.click(checkbox);
    expect(screen.getByLabelText("add to history")).toHaveTextContent("Add 1 to History");
  });
});

describe("PermitImportReviewPanel — Add to History gating", () => {
  it("disables the button once every permit is unchecked", () => {
    render(<PermitImportReviewPanel permits={[makePermit()]} onConfirm={vi.fn()} onDismissAll={vi.fn()} />);
    fireEvent.click(screen.getByLabelText("include permit P-1001"));
    expect(screen.getByLabelText("add to history")).toBeDisabled();
  });
});

describe("PermitImportReviewPanel — Skip", () => {
  it("calls onDismissAll regardless of checkbox state", () => {
    const onDismissAll = vi.fn();
    render(<PermitImportReviewPanel permits={[makePermit()]} onConfirm={vi.fn()} onDismissAll={onDismissAll} />);
    fireEvent.click(screen.getByLabelText("include permit P-1001"));
    fireEvent.click(screen.getByLabelText("skip"));
    expect(onDismissAll).toHaveBeenCalled();
  });
});

describe("PermitImportReviewPanel — estimated cost", () => {
  it("shows the formatted cost when estimatedValueCents is set", () => {
    render(<PermitImportReviewPanel permits={[makePermit({ estimatedValueCents: 1_250_000 })]} onConfirm={vi.fn()} onDismissAll={vi.fn()} />);
    expect(screen.getByText("$12,500")).toBeInTheDocument();
  });

  it("omits the cost when estimatedValueCents is not set", () => {
    render(<PermitImportReviewPanel permits={[makePermit()]} onConfirm={vi.fn()} onDismissAll={vi.fn()} />);
    expect(screen.queryByText(/^\$/)).not.toBeInTheDocument();
  });
});
