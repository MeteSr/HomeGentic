/**
 * Button — real logic worth locking down:
 *   - disabled state is true when either `disabled` or `loading` is passed
 *   - loading swaps the leading icon for a spinner and suppresses iconRight
 *   - onClick does not fire when disabled/loading (native button behavior)
 *   - hover state applies the variant-specific hover style override, but
 *     never while disabled
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { Button } from "@/components/Button";

describe("Button — disabled/loading state", () => {
  it("is not disabled by default", () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole("button")).not.toBeDisabled();
  });

  it("is disabled when disabled=true", () => {
    render(<Button disabled>Click me</Button>);
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("is disabled when loading=true even if disabled is not set", () => {
    render(<Button loading>Click me</Button>);
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("renders a spinner instead of the icon when loading", () => {
    render(<Button loading icon={<span data-testid="my-icon" />}>Save</Button>);
    expect(screen.queryByTestId("my-icon")).not.toBeInTheDocument();
    expect(document.querySelector(".btn-spinner")).toBeInTheDocument();
  });

  it("renders the icon (not a spinner) when not loading", () => {
    render(<Button icon={<span data-testid="my-icon" />}>Save</Button>);
    expect(screen.getByTestId("my-icon")).toBeInTheDocument();
    expect(document.querySelector(".btn-spinner")).not.toBeInTheDocument();
  });

  it("suppresses iconRight while loading", () => {
    render(<Button loading iconRight={<span data-testid="right-icon" />}>Save</Button>);
    expect(screen.queryByTestId("right-icon")).not.toBeInTheDocument();
  });

  it("renders iconRight when not loading", () => {
    render(<Button iconRight={<span data-testid="right-icon" />}>Save</Button>);
    expect(screen.getByTestId("right-icon")).toBeInTheDocument();
  });
});

describe("Button — click handling", () => {
  it("calls onClick when enabled", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Click me</Button>);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does not call onClick when disabled", () => {
    const onClick = vi.fn();
    render(<Button disabled onClick={onClick}>Click me</Button>);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("does not call onClick when loading", () => {
    const onClick = vi.fn();
    render(<Button loading onClick={onClick}>Click me</Button>);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("Button — hover style overrides", () => {
  it("applies the primary hover transform on mouse enter", () => {
    render(<Button variant="primary">Click me</Button>);
    const btn = screen.getByRole("button");
    expect(btn.style.transform).toBe("");

    fireEvent.mouseEnter(btn);
    expect(btn.style.transform).toBe("translateY(-2px)");

    fireEvent.mouseLeave(btn);
    expect(btn.style.transform).toBe("");
  });

  it("does not apply a hover transform when disabled", () => {
    render(<Button variant="primary" disabled>Click me</Button>);
    const btn = screen.getByRole("button");
    fireEvent.mouseEnter(btn);
    expect(btn.style.transform).toBe("");
  });

  it("applies the secondary variant's hover background/border color", () => {
    render(<Button variant="secondary">Click me</Button>);
    const btn = screen.getByRole("button");
    fireEvent.mouseEnter(btn);
    expect(btn.style.borderColor).not.toBe("");
  });
});

describe("Button — variant/size styling", () => {
  it("applies danger variant background color", () => {
    render(<Button variant="danger">Delete</Button>);
    const btn = screen.getByRole("button");
    expect(btn.style.backgroundColor).not.toBe("");
  });

  it("applies a larger font size for the lg size than sm", () => {
    const small = render(<Button size="sm">A</Button>);
    const smallFontSize = parseFloat(small.getByRole("button").style.fontSize);
    small.unmount();

    const large = render(<Button size="lg">B</Button>);
    const largeFontSize = parseFloat(large.getByRole("button").style.fontSize);

    expect(largeFontSize).toBeGreaterThan(smallFontSize);
  });

  it("lets a custom style prop override computed styles", () => {
    const { getByRole } = render(<Button style={{ backgroundColor: "purple" }}>Click me</Button>);
    expect(getByRole("button").style.backgroundColor).toBe("purple");
  });
});
