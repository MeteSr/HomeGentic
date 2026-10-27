/**
 * MainLandmark: every page gets exactly one `main` landmark, and the skip link
 * moves focus to the page's content.
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { AppMain, Main, SkipLink } from "@/components/MainLandmark";

describe("AppMain", () => {
  it("is the main landmark for a page without its own <main>", () => {
    render(<AppMain><h1>Pricing</h1></AppMain>);
    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(screen.getByTestId("app-main")).toHaveAttribute("role", "main");
  });

  it("steps aside while a page renders <Main>, so landmarks don't nest", () => {
    const { rerender } = render(<AppMain><Main><h1>Jobs</h1></Main></AppMain>);
    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(screen.getByTestId("app-main")).not.toHaveAttribute("role");

    rerender(<AppMain><h1>Pricing</h1></AppMain>);
    expect(screen.getByTestId("app-main")).toHaveAttribute("role", "main");
  });
});

describe("SkipLink", () => {
  it("focuses the page's h1, skipping the page nav", () => {
    render(
      <>
        <SkipLink />
        <AppMain>
          <nav><a href="/x">Nav link</a></nav>
          <h1>Check an address</h1>
        </AppMain>
      </>,
    );
    fireEvent.click(screen.getByRole("link", { name: "Skip to main content" }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveFocus();
  });

  it("falls back to the main landmark when there's no h1", () => {
    render(<><SkipLink /><AppMain><p>No heading</p></AppMain></>);
    fireEvent.click(screen.getByRole("link", { name: "Skip to main content" }));
    expect(screen.getByRole("main")).toHaveFocus();
  });
});
