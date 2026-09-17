/**
 * PropertyCard — real logic worth locking down:
 *   - shows the property's address/city/state/zip/type and the given
 *     badge
 *   - clicking calls onClick
 *   - Enter and Space both activate onClick via keyboard; other keys
 *     do not
 *   - hover changes the border color (interaction feedback)
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { PropertyCard } from "@/components/PropertyCard";
import type { Property } from "@/services/property";

function makeProperty(overrides: Partial<Property> = {}): Property {
  return {
    id: "prop-1", owner: "p-owner", address: "123 Main St", city: "Austin", state: "TX",
    zipCode: "78701", propertyType: "SingleFamily" as any, yearBuilt: 2000n, squareFeet: 2000n,
    verificationLevel: "None" as any, tier: "Free" as any, createdAt: 0n, updatedAt: 0n, isActive: true,
    ...overrides,
  };
}

describe("PropertyCard — content", () => {
  it("shows the address, city/state/zip, type, and badge", () => {
    render(<PropertyCard property={makeProperty()} onClick={vi.fn()} badge={<span>Verified</span>} />);
    expect(screen.getByText("123 Main St")).toBeInTheDocument();
    expect(screen.getByText("Austin, TX 78701")).toBeInTheDocument();
    expect(screen.getByText("SingleFamily")).toBeInTheDocument();
    expect(screen.getByText("Verified")).toBeInTheDocument();
  });
});

describe("PropertyCard — interaction", () => {
  it("calls onClick on click", () => {
    const onClick = vi.fn();
    render(<PropertyCard property={makeProperty()} onClick={onClick} badge={null} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalled();
  });

  it("activates via Enter and Space keys", () => {
    const onClick = vi.fn();
    render(<PropertyCard property={makeProperty()} onClick={onClick} badge={null} />);
    const card = screen.getByRole("button");

    fireEvent.keyDown(card, { key: "Enter" });
    expect(onClick).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(card, { key: " " });
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it("does not activate on unrelated keys", () => {
    const onClick = vi.fn();
    render(<PropertyCard property={makeProperty()} onClick={onClick} badge={null} />);
    fireEvent.keyDown(screen.getByRole("button"), { key: "Escape" });
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("PropertyCard — hover feedback", () => {
  it("changes border color on hover and reverts on leave", () => {
    render(<PropertyCard property={makeProperty()} onClick={vi.fn()} badge={null} />);
    const card = screen.getByRole("button");
    expect(card).toHaveStyle({ borderColor: "rgb(230, 231, 238)" });

    fireEvent.mouseEnter(card);
    expect(card).toHaveStyle({ borderColor: "rgb(185, 189, 245)" });

    fireEvent.mouseLeave(card);
    expect(card).toHaveStyle({ borderColor: "rgb(230, 231, 238)" });
  });
});
