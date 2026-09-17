/**
 * PropertyEstimatedValueInput — real logic worth locking down:
 *   - loads any previously saved value for the property on mount, and
 *     re-loads when propertyId changes
 *   - strips non-digit input, persists to localStorage keyed by
 *     property, and calls onValueChange with the parsed number
 *   - onValueChange is not called while the field is cleared to blank
 *   - getStoredEstimatedValue reads back the persisted value, and
 *     returns null for an unset or corrupt value
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PropertyEstimatedValueInput, getStoredEstimatedValue } from "@/components/PropertyEstimatedValueInput";

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe("PropertyEstimatedValueInput — loading", () => {
  it("starts blank with nothing saved", () => {
    render(<PropertyEstimatedValueInput propertyId="prop-1" />);
    expect(screen.getByLabelText("estimated home value")).toHaveValue("");
  });

  it("loads a previously saved value on mount", () => {
    localStorage.setItem("hf_est_val_prop-1", "425000");
    render(<PropertyEstimatedValueInput propertyId="prop-1" />);
    expect(screen.getByLabelText("estimated home value")).toHaveValue("425000");
  });

  it("re-loads the value when propertyId changes", () => {
    localStorage.setItem("hf_est_val_prop-1", "425000");
    localStorage.setItem("hf_est_val_prop-2", "300000");
    const { rerender } = render(<PropertyEstimatedValueInput propertyId="prop-1" />);
    expect(screen.getByLabelText("estimated home value")).toHaveValue("425000");

    rerender(<PropertyEstimatedValueInput propertyId="prop-2" />);
    expect(screen.getByLabelText("estimated home value")).toHaveValue("300000");
  });
});

describe("PropertyEstimatedValueInput — editing", () => {
  it("strips non-digit characters and persists the sanitized value", () => {
    render(<PropertyEstimatedValueInput propertyId="prop-1" />);
    fireEvent.change(screen.getByLabelText("estimated home value"), { target: { value: "$425,000" } });

    expect(screen.getByLabelText("estimated home value")).toHaveValue("425000");
    expect(localStorage.getItem("hf_est_val_prop-1")).toBe("425000");
  });

  it("calls onValueChange with the parsed number", () => {
    const onValueChange = vi.fn();
    render(<PropertyEstimatedValueInput propertyId="prop-1" onValueChange={onValueChange} />);
    fireEvent.change(screen.getByLabelText("estimated home value"), { target: { value: "425000" } });
    expect(onValueChange).toHaveBeenCalledWith(425000);
  });

  it("does not call onValueChange when cleared to blank", () => {
    const onValueChange = vi.fn();
    render(<PropertyEstimatedValueInput propertyId="prop-1" onValueChange={onValueChange} />);
    const input = screen.getByLabelText("estimated home value");
    fireEvent.change(input, { target: { value: "425000" } });
    onValueChange.mockClear();

    fireEvent.change(input, { target: { value: "" } });
    expect(onValueChange).not.toHaveBeenCalled();
    expect(localStorage.getItem("hf_est_val_prop-1")).toBe("");
  });
});

describe("getStoredEstimatedValue", () => {
  it("returns the persisted numeric value", () => {
    localStorage.setItem("hf_est_val_prop-1", "425000");
    expect(getStoredEstimatedValue("prop-1")).toBe(425000);
  });

  it("returns null when nothing is stored", () => {
    expect(getStoredEstimatedValue("prop-unset")).toBeNull();
  });

  it("returns null for a corrupt (non-numeric) stored value", () => {
    localStorage.setItem("hf_est_val_prop-1", "not-a-number");
    expect(getStoredEstimatedValue("prop-1")).toBeNull();
  });
});
