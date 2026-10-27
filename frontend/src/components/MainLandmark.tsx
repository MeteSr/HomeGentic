import React, { createContext, useCallback, useContext, useLayoutEffect, useState } from "react";

/**
 * Every page needs exactly one `main` landmark (WCAG 1.3.1 / 2.4.1). Signed-in
 * pages get theirs from `Layout`, but the public pages are hand-built and most
 * had none. `AppMain` wraps all routes and acts as the `main` landmark unless
 * the rendered page has its own: such pages render `<Main>` instead of `<main>`,
 * which drops the wrapper's role before paint so landmarks never nest. Only the
 * role attribute toggles, so the page subtree isn't remounted.
 */

const ClaimContext = createContext<(delta: number) => void>(() => {});

export function AppMain({ children }: { children: React.ReactNode }) {
  const [owned, setOwned] = useState(0);
  const claim = useCallback((delta: number) => setOwned((n) => n + delta), []);
  return (
    <ClaimContext.Provider value={claim}>
      <div id="main-content" role={owned > 0 ? undefined : "main"} data-testid="app-main">
        {children}
      </div>
    </ClaimContext.Provider>
  );
}

function useOwnMainLandmark() {
  const claim = useContext(ClaimContext);
  useLayoutEffect(() => {
    claim(1);
    return () => claim(-1);
  }, [claim]);
}

/** Use instead of a bare `<main>` so `AppMain` steps aside while it's mounted. */
export function Main(props: React.ComponentPropsWithoutRef<"main">) {
  useOwnMainLandmark();
  return <main {...props} />;
}

/**
 * Moves focus to the start of the page's content: its `<h1>` (which comes
 * after any page-level nav), or the main landmark itself when there's no h1.
 */
export function focusMainContent() {
  const main = document.querySelector<HTMLElement>("main, [role='main']");
  const target = main?.querySelector<HTMLElement>("h1") ?? main;
  if (!target) return;
  if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
  target.focus({ preventScroll: true });
  target.scrollIntoView?.({ block: "start" });
}

/** First focusable element on every page (WCAG 2.4.1 Bypass Blocks). */
export function SkipLink() {
  return (
    <a
      href="#main-content"
      className="skip-link"
      onClick={(e) => { e.preventDefault(); focusMainContent(); }}
    >
      Skip to main content
    </a>
  );
}
