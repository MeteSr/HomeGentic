/**
 * RouteAnnouncer — per-route titles, heading focus and a live announcement
 * after client-side navigation.
 *
 * RA.1  titleForPath picks the most specific route and falls back to the default
 * RA.2  The first render sets the title but doesn't move focus or announce
 * RA.3  A navigation focuses the new page's <h1> (read by screen readers, so no extra announcement)
 * RA.4  A page that focused something itself keeps that focus, and the title is announced
 */

import React, { useEffect } from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { MemoryRouter, Routes, Route, Link } from "react-router-dom";
import { RouteAnnouncer, titleForPath } from "@/components/RouteAnnouncer";

afterEach(() => vi.useRealTimers());

function App() {
  return (
    <MemoryRouter initialEntries={["/jobs"]}>
      <RouteAnnouncer />
      <Routes>
        <Route path="/jobs" element={<><h1>Jobs page</h1><Link to="/settings">Go to settings</Link><Link to="/warranties">Go to warranties</Link></>} />
        <Route path="/settings" element={<h1>Settings page</h1>} />
        <Route path="/warranties" element={<AutoFocusPage />} />
      </Routes>
    </MemoryRouter>
  );
}

function AutoFocusPage() {
  const ref = React.useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return <><h1>Warranties page</h1><input ref={ref} aria-label="Search warranties" /></>;
}

describe("RouteAnnouncer", () => {
  it("RA.1 maps paths to titles", () => {
    expect(titleForPath("/jobs/new")).toBe("Post a job | HomeGentic");
    expect(titleForPath("/jobs")).toBe("Jobs | HomeGentic");
    expect(titleForPath("/properties/12/systems")).toBe("System ages | HomeGentic");
    expect(titleForPath("/properties/12/verify/identity")).toBe("Verify ownership | HomeGentic");
    expect(titleForPath("/contractor/profile")).toBe("Contractor profile | HomeGentic");
  });

  it("RA.2 sets the title on first render without moving focus", () => {
    vi.useFakeTimers();
    render(<App />);
    act(() => { vi.runAllTimers(); });
    expect(document.title).toBe("Jobs | HomeGentic");
    expect(screen.getByRole("heading", { name: "Jobs page" })).not.toHaveFocus();
    expect(screen.getByTestId("route-announcer")).toHaveTextContent("");
  });

  it("RA.3 focuses the new heading", () => {
    vi.useFakeTimers();
    window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
    render(<App />);
    fireEvent.click(screen.getByText("Go to settings"));
    act(() => { vi.runAllTimers(); });
    expect(document.title).toBe("Settings | HomeGentic");
    expect(screen.getByRole("heading", { name: "Settings page" })).toHaveFocus();
    expect(screen.getByTestId("route-announcer")).toHaveTextContent("");
  });

  it("RA.4 leaves focus where the page put it", () => {
    vi.useFakeTimers();
    window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
    render(<App />);
    fireEvent.click(screen.getByText("Go to warranties"));
    act(() => { vi.runAllTimers(); });
    expect(screen.getByLabelText("Search warranties")).toHaveFocus();
    expect(screen.getByTestId("route-announcer")).toHaveTextContent("Warranty wallet | HomeGentic");
  });
});
