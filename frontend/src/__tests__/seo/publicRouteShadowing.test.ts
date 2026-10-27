/**
 * A file in public/ is served as-is at its path, ahead of the SPA fallback in
 * _redirects. One named like a route (public/sample-report did this) hides
 * the React page behind a stale static copy.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "fs";
import { resolve } from "path";

const FRONTEND = resolve(__dirname, "../../..");

describe("public/ never shadows an app route", () => {
  it("no public file or folder shares a name with a route in App.tsx", () => {
    const app = readFileSync(resolve(FRONTEND, "src/App.tsx"), "utf8");
    const routes = new Set(
      [...app.matchAll(/path="\/([^"/:*]+)/g)].map((m) => m[1]),
    );
    const shadowing = readdirSync(resolve(FRONTEND, "public")).filter((name) => routes.has(name));
    expect(shadowing).toEqual([]);
  });
});
