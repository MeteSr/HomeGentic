/**
 * SEO — private share links stay out of search results.
 *
 * Token links (/report/:token, /badge/:token, claim and verify links) are
 * shared privately and carry a home's address and history. Each must carry
 * <meta name="robots" content="noindex, nofollow">, and every ":token" route
 * App.tsx declares must be on the list (or on the deliberately public list).
 */
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, it, expect, afterEach } from "vitest";
import {
  NOINDEX_ROUTES,
  PUBLIC_TOKEN_ROUTES,
  isNoindexPath,
  PrivateLinkNoindex,
} from "@/components/PrivateLinkNoindex";

const robots = () => document.querySelector('meta[name="robots"]')?.getAttribute("content") ?? null;

afterEach(() => document.querySelectorAll('meta[name="robots"]').forEach((el) => el.remove()));

describe("isNoindexPath", () => {
  it.each([
    "/report/abc123",
    "/badge/abc123",
    "/transfer/claim/abc123",
    "/successor/abc123",
    "/manage/claim/abc123",
    "/cert/abc123",
    "/verify/abc123",
    "/guide/abc123",
  ])("marks %s noindex", (path) => {
    expect(isNoindexPath(path)).toBe(true);
  });

  it.each(["/", "/pricing", "/homes", "/for-sale/prop-1", "/verify-record", "/sample-report"])(
    "leaves %s indexable",
    (path) => {
      expect(isNoindexPath(path)).toBe(false);
    },
  );
});

describe("PrivateLinkNoindex", () => {
  it("adds a noindex robots tag on a private report link", () => {
    render(
      <MemoryRouter initialEntries={["/report/tok-1"]}>
        <PrivateLinkNoindex />
      </MemoryRouter>,
    );
    expect(robots()).toBe("noindex, nofollow");
  });

  it("adds nothing on a public page", () => {
    render(
      <MemoryRouter initialEntries={["/pricing"]}>
        <PrivateLinkNoindex />
      </MemoryRouter>,
    );
    expect(robots()).toBeNull();
  });

  it("removes the tag when it unmounts", () => {
    const { unmount } = render(
      <MemoryRouter initialEntries={["/badge/tok-1"]}>
        <PrivateLinkNoindex />
      </MemoryRouter>,
    );
    unmount();
    expect(robots()).toBeNull();
  });
});

describe("App.tsx token routes", () => {
  const app = readFileSync(resolve(__dirname, "../../App.tsx"), "utf-8");
  const tokenRoutes = [...app.matchAll(/path="([^"]*:token[^"]*)"/g)].map(([, p]) => p);

  it("finds the token routes", () => {
    expect(tokenRoutes.length).toBeGreaterThan(5);
  });

  it("puts every :token route on the noindex list or the deliberate public list", () => {
    const unclassified = tokenRoutes.filter((r) => !NOINDEX_ROUTES.includes(r) && !PUBLIC_TOKEN_ROUTES.includes(r));
    expect(unclassified).toEqual([]);
  });
});
