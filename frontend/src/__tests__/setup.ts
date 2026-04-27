import "@testing-library/jest-dom";
import { cleanup, act } from "@testing-library/react";
import { configure } from "@testing-library/dom";
import { afterEach } from "vitest";

// Increase waitFor / findBy default timeout from 1000ms to 10000ms so that
// async UI updates complete even under heavy parallel-suite load (137 files
// running simultaneously saturate jsdom environment setup and slow individual
// test files to 15–34s, causing the default 1s RTL timeout to expire first).
configure({ asyncUtilTimeout: 10000 });

// Vitest global setup — runs before each test file.
// Provides a minimal window.location.origin for services that reference it.
Object.defineProperty(window, "location", {
  value: { origin: "http://localhost:3000", href: "http://localhost:3000/" },
  writable: true,
});

// Default matchMedia stub — jsdom doesn't implement matchMedia.
// Individual test files may override this with configurable: true stubs
// that simulate specific viewport widths.
if (typeof window.matchMedia !== "function") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

// HTMLCanvasElement.getContext() stub — jsdom doesn't implement canvas rendering.
// Without this, any component that touches <canvas> (e.g. QR-code libraries,
// chart renderers) floods stderr with "Not implemented" warnings.
if (typeof HTMLCanvasElement !== "undefined") {
  HTMLCanvasElement.prototype.getContext = () => null;
}

// window.indexedDB stub — jsdom provides no IDB implementation.
// AuthContext (and ICP auth-client) calls indexedDB.open() at mount; without
// this stub the call returns undefined and the promise-chain hangs, causing
// parallel test suites to time-out waiting on IDB-dependent async effects.
// Throwing a DOMException makes the error path run immediately so the
// component reaches a settled state before assertions run.
if (!("indexedDB" in window) || (window as any).indexedDB == null) {
  Object.defineProperty(window, "indexedDB", {
    writable: true,
    configurable: true,
    value: {
      open(_name: string, _version?: number): never {
        throw new DOMException("Not available in jsdom", "UnknownError");
      },
      deleteDatabase(): never {
        throw new DOMException("Not available in jsdom", "UnknownError");
      },
      cmp: () => 0,
    },
  });
}

// Default requestAnimationFrame stub — react-helmet-async defers DOM writes
// via RAF; this makes those writes synchronous in tests.
if (typeof (globalThis as any).requestAnimationFrame !== "function") {
  (globalThis as any).requestAnimationFrame = (cb: FrameRequestCallback) => { cb(0); return 0; };
  (globalThis as any).cancelAnimationFrame = () => {};
}

// Flush all pending async state updates (useEffect promise chains) before
// cleanup so React doesn't warn "state update should be wrapped in act(...)".
//
// A bare `await act(async () => {})` only drains one microtask layer.
// Components with chained .then() calls (e.g. getContractor → getCredentials)
// enqueue a second microtask after the first resolves — those land outside
// act if we don't yield to the macrotask queue first.
// `setTimeout(r, 0)` is a macrotask; it only fires after the microtask
// queue is fully drained, so act() sees all pending state updates.
afterEach(async () => {
  await act(async () => {
    await new Promise<void>((r) => setTimeout(r, 0));
  });
  cleanup();
});
