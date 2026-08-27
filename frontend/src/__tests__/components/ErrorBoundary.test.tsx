/**
 * Unit tests for ErrorBoundary component
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ErrorBoundary } from "@/components/ErrorBoundary";

// Suppress React's own console.error output for expected error boundary catches
beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

// Mock errorTracker so we don't hit real network calls
vi.mock("@/services/errorTracker", () => ({
  errorTracker: {
    captureError: vi.fn(),
  },
}));

// A child that throws on demand
function ThrowingChild({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error("Test render error");
  }
  return <div>Normal child content</div>;
}

describe("ErrorBoundary — children render normally", () => {
  it("renders children when no error occurs", () => {
    render(
      <ErrorBoundary>
        <div>Hello world</div>
      </ErrorBoundary>
    );
    expect(screen.getByText("Hello world")).toBeInTheDocument();
  });

  it("does not show any error UI when children are healthy", () => {
    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={false} />
      </ErrorBoundary>
    );
    expect(screen.getByText("Normal child content")).toBeInTheDocument();
    expect(screen.queryByText(/error/i)).not.toBeInTheDocument();
  });
});

describe("ErrorBoundary — catches render errors (inline mode)", () => {
  it("renders an inline error card when a child throws", () => {
    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>
    );
    // Should render the inline error text
    expect(screen.getByText(/unexpected error/i)).toBeInTheDocument();
  });

  it("shows a Try again button in inline mode", () => {
    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  it("shows Try again button that is clickable", () => {
    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>
    );
    const btn = screen.getByRole("button", { name: /try again/i });
    // After clicking Try again, the error state is cleared; child will throw again
    // but the click itself should not throw
    expect(() => fireEvent.click(btn)).not.toThrow();
  });
});

describe("ErrorBoundary — global mode", () => {
  it("renders a full-page error when global prop is set", () => {
    render(
      <ErrorBoundary global>
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument();
  });

  it("shows a Reload page button in global mode", () => {
    render(
      <ErrorBoundary global>
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.getByRole("button", { name: /reload page/i })).toBeInTheDocument();
  });
});

describe("ErrorBoundary — section label", () => {
  it("includes the section label in the error text", () => {
    render(
      <ErrorBoundary section="Dashboard">
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>
    );
    // The section label is prepended to "Error" as "Dashboard — Error"
    expect(screen.getByText(/Dashboard/)).toBeInTheDocument();
  });
});
