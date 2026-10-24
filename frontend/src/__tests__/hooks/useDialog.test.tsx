/**
 * Unit tests — useDialog
 *
 * UD.1  Spreads role, aria-modal and the accessible name on the panel
 * UD.2  Moves focus into the panel ([data-autofocus] first) and back on close
 * UD.3  Escape calls onClose; does nothing when onClose is undefined
 * UD.4  Tab and Shift+Tab wrap inside the panel
 * UD.5  Only the topmost of two stacked dialogs reacts to Escape
 */

import React, { useState } from "react";
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useDialog, type DialogOptions } from "@/hooks/useDialog";

function Dialog({ onClose, options = { label: "Test dialog" }, children }: {
  onClose?: () => void; options?: DialogOptions; children?: React.ReactNode;
}) {
  const dialog = useDialog(true, onClose, options);
  return <div {...dialog} data-testid="panel">{children ?? <><button>First</button><button>Last</button></>}</div>;
}

function Harness({ onClose }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open</button>
      {open && <Dialog onClose={() => { onClose?.(); setOpen(false); }}><button data-autofocus>Inside</button></Dialog>}
    </>
  );
}

describe("useDialog", () => {
  // jsdom has no layout, so offsetParent is always null; the hook uses it to skip hidden items.
  const desc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetParent");
  beforeAll(() => {
    Object.defineProperty(HTMLElement.prototype, "offsetParent", { configurable: true, get() { return this.parentNode; } });
  });
  afterAll(() => { if (desc) Object.defineProperty(HTMLElement.prototype, "offsetParent", desc); });

  it("UD.1 names the panel as a modal dialog", () => {
    render(<Dialog onClose={() => {}} />);
    const panel = screen.getByRole("dialog", { name: "Test dialog" });
    expect(panel).toHaveAttribute("aria-modal", "true");
  });

  it("UD.1 prefers labelledBy over label", () => {
    render(<><h2 id="t">Heading</h2><Dialog onClose={() => {}} options={{ label: "x", labelledBy: "t", role: "alertdialog" }} /></>);
    const panel = screen.getByRole("alertdialog", { name: "Heading" });
    expect(panel).not.toHaveAttribute("aria-label");
  });

  it("UD.2 focuses [data-autofocus] and restores focus on close", () => {
    render(<Harness />);
    const opener = screen.getByText("Open");
    opener.focus();
    fireEvent.click(opener);
    expect(screen.getByText("Inside")).toHaveFocus();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByText("Inside")).toBeNull();
    expect(opener).toHaveFocus();
  });

  it("UD.2 focuses the panel when nothing is marked autofocus", () => {
    render(<Dialog onClose={() => {}} />);
    expect(screen.getByTestId("panel")).toHaveFocus();
  });

  it("UD.3 Escape calls onClose", () => {
    const onClose = vi.fn();
    render(<Dialog onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("UD.3 Escape is ignored when the dialog can't be dismissed", () => {
    render(<Dialog />);
    expect(() => fireEvent.keyDown(document, { key: "Escape" })).not.toThrow();
    expect(screen.getByTestId("panel")).toBeInTheDocument();
  });

  it("UD.4 Tab wraps from last to first and Shift+Tab from first to last", () => {
    render(<Dialog onClose={() => {}} />);
    const first = screen.getByText("First");
    const last = screen.getByText("Last");
    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(first).toHaveFocus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(last).toHaveFocus();
  });

  it("UD.5 only the topmost dialog closes on Escape", () => {
    const outer = vi.fn();
    const inner = vi.fn();
    render(<Dialog onClose={outer}><Dialog onClose={inner} options={{ label: "Inner" }} /></Dialog>);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(inner).toHaveBeenCalledTimes(1);
    expect(outer).not.toHaveBeenCalled();
  });
});
