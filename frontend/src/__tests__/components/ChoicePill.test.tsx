/**
 * ChoicePill — real logic worth locking down:
 *   - clicking calls onClick, unless locked, in which case it's a
 *     no-op and the lockedTitle is shown as the title attribute
 *   - selected uses the cobalt fill; locked uses the disabled surface
 *     regardless of selected; unselected uses the plain style and
 *     highlights its border on hover
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ChoicePill } from "@/components/ChoicePill";

describe("ChoicePill — click behavior", () => {
  it("calls onClick when not locked", () => {
    const onClick = vi.fn();
    render(<ChoicePill label="Weekly" selected={false} onClick={onClick} />);
    fireEvent.click(screen.getByText("Weekly"));
    expect(onClick).toHaveBeenCalled();
  });

  it("blocks the click and shows the lockedTitle when locked", () => {
    const onClick = vi.fn();
    render(<ChoicePill label="Pro Only" selected={false} locked lockedTitle="Upgrade to unlock" onClick={onClick} />);
    const btn = screen.getByText("Pro Only");
    fireEvent.click(btn);

    expect(onClick).not.toHaveBeenCalled();
    expect(btn).toHaveAttribute("title", "Upgrade to unlock");
  });
});

describe("ChoicePill — style states", () => {
  it("uses the cobalt fill when selected", () => {
    render(<ChoicePill label="Selected" selected onClick={vi.fn()} />);
    expect(screen.getByText("Selected")).toHaveStyle({ background: "rgb(43, 52, 255)" });
  });

  it("uses the disabled surface when locked, even if selected", () => {
    render(<ChoicePill label="Locked" selected locked onClick={vi.fn()} />);
    expect(screen.getByText("Locked")).toHaveStyle({ background: "rgb(247, 248, 251)" });
  });

  it("highlights the border on hover when unselected and unlocked", () => {
    render(<ChoicePill label="Idle" selected={false} onClick={vi.fn()} />);
    const btn = screen.getByText("Idle");
    expect(btn).toHaveStyle({ borderColor: "rgb(217, 219, 228)" });

    fireEvent.mouseEnter(btn);
    expect(btn).toHaveStyle({ borderColor: "rgb(43, 52, 255)" });

    fireEvent.mouseLeave(btn);
    expect(btn).toHaveStyle({ borderColor: "rgb(217, 219, 228)" });
  });
});
