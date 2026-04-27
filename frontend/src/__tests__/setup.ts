import "@testing-library/jest-dom";
import { cleanup, act } from "@testing-library/react";
import { configure } from "@testing-library/dom";
import { afterEach } from "vitest";

// Provide a minimal window.indexedDB stub so @icp-sdk/auth's IdbStorage does
// not throw "ReferenceError: indexedDB is not defined" in jsdom.  The stub
// fires an error event on the next microtask; idb's openDB Promise then
// rejects, IdbStorage._db resolves to null, and AuthClient falls back to an
// anonymous in-memory identity without hanging.
if (!("indexedDB" in window)) {
  Object.defineProperty(window, "indexedDB", {
    writable: true,
    configurable: true,
    value: {
      open(_name: string, _version?: number) {
        const handlers: Record<string, Function[]> = {};
        const req: any = {
          result: null,
          error: new DOMException("Not available in jsdom", "UnknownError"),
          addEventListener(type: string, fn: Function) {
            (handlers[type] ??= []).push(fn);
          },
          removeEventListener(type: string, fn: Function) {
            handlers[type] = (handlers[type] ?? []).filter((f) => f !== fn);
          },
          dispatchEvent: () => false,
        };
        Promise.resolve().then(() => {
          (handlers["error"] ?? []).forEach((fn) => fn({ target: req }));
        });
        return req;
      },
      deleteDatabase() {
        return { addEventListener: () => {}, removeEventListener: () => {} };
      },
      cmp: () => 0,
    },
  });
}

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
