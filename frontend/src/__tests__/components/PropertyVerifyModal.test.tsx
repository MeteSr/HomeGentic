/**
 * PropertyVerifyModal — real logic worth locking down:
 *   - renders nothing when closed
 *   - Start verification closes the modal and navigates to the
 *     property's verify route
 *   - backdrop click closes; clicking modal content does not
 *   - the Close button closes the modal
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import PropertyVerifyModal from "@/components/PropertyVerifyModal";

const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }));
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

function renderModal(props: Partial<React.ComponentProps<typeof PropertyVerifyModal>> = {}) {
  const onClose = vi.fn();
  const utils = render(<PropertyVerifyModal open onClose={onClose} propertyId="prop-1" {...props} />);
  return { ...utils, onClose };
}

beforeEach(() => vi.clearAllMocks());

describe("PropertyVerifyModal — visibility", () => {
  it("renders nothing when open is false", () => {
    const { container } = render(<PropertyVerifyModal open={false} onClose={vi.fn()} propertyId="prop-1" />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("PropertyVerifyModal — start verification", () => {
  it("closes the modal and navigates to the property's verify route", () => {
    const { onClose } = renderModal({ propertyId: "prop-42" });
    fireEvent.click(screen.getByText("Start verification"));

    expect(onClose).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith("/properties/prop-42/verify");
  });
});

describe("PropertyVerifyModal — dismissal", () => {
  it("closes on backdrop click but not on modal content click", () => {
    const { onClose } = renderModal();
    fireEvent.click(screen.getByText("Verify your ownership")); // inner content
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("dialog")); // backdrop
    expect(onClose).toHaveBeenCalled();
  });

  it("closes via the Close button", () => {
    const { onClose } = renderModal();
    fireEvent.click(screen.getByLabelText("Close"));
    expect(onClose).toHaveBeenCalled();
  });
});
