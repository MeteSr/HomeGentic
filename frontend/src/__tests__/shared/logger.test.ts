/**
 * packages/shared logger: JSON lines, stdout for info/debug and stderr for
 * warn/error, filtered by LOG_LEVEL (test-gap audit 2026-11-03, L4).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { logger } from "@homegentic/shared/logger";

let out: ReturnType<typeof vi.spyOn>;
let err: ReturnType<typeof vi.spyOn>;
const lines = (spy: ReturnType<typeof vi.spyOn>): any[] =>
  spy.mock.calls.map((c: unknown[]) => JSON.parse(String(c[0])));

beforeEach(() => {
  out = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  err = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  delete process.env.LOG_LEVEL;
});
afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.LOG_LEVEL;
});

describe("logger", () => {
  it("writes one JSON line with level, component, message and metadata", () => {
    logger.info("gateway", "webhook received", { source: "ecobee" });
    const [entry] = lines(out);
    expect(entry).toMatchObject({ level: "info", component: "gateway", msg: "webhook received", source: "ecobee" });
    expect(new Date(entry.ts).toISOString()).toBe(entry.ts);
    expect(String(out.mock.calls[0][0]).endsWith("\n")).toBe(true);
  });

  it("sends warn and error to stderr, info to stdout", () => {
    logger.warn("c", "w");
    logger.error("c", "e");
    logger.info("c", "i");
    expect(lines(err).map((e) => e.level)).toEqual(["warn", "error"]);
    expect(lines(out).map((e) => e.level)).toEqual(["info"]);
  });

  it("drops debug by default and keeps it at LOG_LEVEL=debug", () => {
    logger.debug("c", "hidden");
    expect(out).not.toHaveBeenCalled();
    process.env.LOG_LEVEL = "DEBUG";
    logger.debug("c", "shown");
    expect(lines(out).map((e) => e.msg)).toEqual(["shown"]);
  });

  it("LOG_LEVEL=error keeps only errors; an unknown level falls back to info", () => {
    process.env.LOG_LEVEL = "error";
    logger.warn("c", "w");
    logger.error("c", "e");
    expect(lines(err).map((e) => e.msg)).toEqual(["e"]);
    process.env.LOG_LEVEL = "loud";
    logger.debug("c", "d");
    logger.info("c", "i");
    expect(lines(out).map((e) => e.msg)).toEqual(["i"]);
  });
});
