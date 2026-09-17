/**
 * AddressAutocomplete — real logic worth locking down for the path
 * this repo's test/CI environment actually exercises (no
 * VITE_GOOGLE_MAPS_API_KEY configured): the field falls back to a
 * plain controlled text input, with:
 *   - typed input calling onChange with the raw value (not
 *     onPlaceSelect, since there's no Places widget without a key)
 *   - the default vs. a custom placeholder
 *   - autoComplete="street-address" when no API key is present
 *   - id/className/style passed straight through to the input
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";

describe("AddressAutocomplete — plain-input fallback (no API key)", () => {
  it("calls onChange with the typed value, not onPlaceSelect", () => {
    const onChange = vi.fn();
    const onPlaceSelect = vi.fn();
    render(<AddressAutocomplete value="" onChange={onChange} onPlaceSelect={onPlaceSelect} />);

    fireEvent.change(screen.getByPlaceholderText("123 Main Street"), { target: { value: "456 Oak Ave" } });

    expect(onChange).toHaveBeenCalledWith("456 Oak Ave");
    expect(onPlaceSelect).not.toHaveBeenCalled();
  });

  it("uses the default placeholder when none is given", () => {
    render(<AddressAutocomplete value="" onChange={vi.fn()} onPlaceSelect={vi.fn()} />);
    expect(screen.getByPlaceholderText("123 Main Street")).toBeInTheDocument();
  });

  it("uses a custom placeholder when given", () => {
    render(<AddressAutocomplete value="" onChange={vi.fn()} onPlaceSelect={vi.fn()} placeholder="Enter address" />);
    expect(screen.getByPlaceholderText("Enter address")).toBeInTheDocument();
  });

  it("sets autoComplete to street-address without an API key", () => {
    render(<AddressAutocomplete value="" onChange={vi.fn()} onPlaceSelect={vi.fn()} />);
    expect(screen.getByPlaceholderText("123 Main Street")).toHaveAttribute("autocomplete", "street-address");
  });

  it("reflects the controlled value prop", () => {
    render(<AddressAutocomplete value="789 Elm St" onChange={vi.fn()} onPlaceSelect={vi.fn()} />);
    expect(screen.getByPlaceholderText("123 Main Street")).toHaveValue("789 Elm St");
  });

  it("passes id and className through to the input", () => {
    const { container } = render(
      <AddressAutocomplete value="" onChange={vi.fn()} onPlaceSelect={vi.fn()} id="addr-1" className="my-input" />
    );
    const input = container.querySelector("input")!;
    expect(input).toHaveAttribute("id", "addr-1");
    expect(input).toHaveClass("my-input");
  });
});
