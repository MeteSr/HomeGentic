/**
 * LoadError — failed loads are announced and offer a retry, so they don't
 * read as an empty state.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LoadError } from "@/components/LoadError";

describe("LoadError", () => {
  it("is an alert naming what failed", () => {
    render(<LoadError what="your jobs" onRetry={() => {}} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load your jobs.");
  });

  it("calls onRetry from the Try again button", () => {
    const onRetry = vi.fn();
    render(<LoadError what="sensor devices" onRetry={onRetry} compact />);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
