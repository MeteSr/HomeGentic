/**
 * Checkbox — real logic worth locking down:
 *   - reflects checked state via aria-checked and shows the check
 *     icon only when checked and not disabled
 *   - clicking toggles by calling onChange with the opposite value
 *   - disabled blocks onChange entirely, even on click, and never
 *     shows the check icon regardless of checked
 *   - a click never bubbles to an ancestor's own click handler
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { Checkbox } from "@/components/Checkbox";

describe("Checkbox — state reflection", () => {
  it("reflects unchecked state with no check icon", () => {
    render(<Checkbox checked={false} onChange={vi.fn()} aria-label="agree" />);
    const box = screen.getByRole("checkbox", { name: "agree" });
    expect(box).toHaveAttribute("aria-checked", "false");
    expect(box.querySelector("svg")).not.toBeInTheDocument();
  });

  it("reflects checked state with the check icon shown", () => {
    render(<Checkbox checked onChange={vi.fn()} aria-label="agree" />);
    const box = screen.getByRole("checkbox", { name: "agree" });
    expect(box).toHaveAttribute("aria-checked", "true");
    expect(box.querySelector("svg")).toBeInTheDocument();
  });
});

describe("Checkbox — toggling", () => {
  it("calls onChange with the opposite value on click", () => {
    const onChange = vi.fn();
    render(<Checkbox checked={false} onChange={onChange} aria-label="agree" />);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(onChange).toHaveBeenCalledWith(true);

    onChange.mockClear();
    render(<Checkbox checked onChange={onChange} aria-label="agree2" />);
    fireEvent.click(screen.getByRole("checkbox", { name: "agree2" }));
    expect(onChange).toHaveBeenCalledWith(false);
  });
});

describe("Checkbox — disabled", () => {
  it("blocks onChange on click when disabled, and hides the check icon even if checked", () => {
    const onChange = vi.fn();
    render(<Checkbox checked disabled onChange={onChange} aria-label="agree" />);
    const box = screen.getByRole("checkbox");
    fireEvent.click(box);

    expect(onChange).not.toHaveBeenCalled();
    expect(box.querySelector("svg")).not.toBeInTheDocument();
    expect(box).toBeDisabled();
  });
});

describe("Checkbox — click propagation", () => {
  it("does not bubble the click to an ancestor handler", () => {
    const onParentClick = vi.fn();
    const onChange = vi.fn();
    render(
      <div onClick={onParentClick}>
        <Checkbox checked={false} onChange={onChange} aria-label="agree" />
      </div>
    );
    fireEvent.click(screen.getByRole("checkbox"));

    expect(onChange).toHaveBeenCalled();
    expect(onParentClick).not.toHaveBeenCalled();
  });
});
