/**
 * @jest-environment node
 */
// Per-user push preferences: defaults, validation, persistence.
import fs   from "fs";
import os   from "os";
import path from "path";

let dir: string;
const saved = { ...process.env };

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "hg-prefs-"));
  process.env.NOTIFICATIONS_DATA_FILE = path.join(dir, "notifications.json");
  jest.resetModules();
});
afterEach(() => {
  process.env = { ...saved };
  fs.rmSync(dir, { recursive: true, force: true });
});

const load = () => require("../prefs") as typeof import("../prefs");

describe("prefs", () => {
  it("has every kind on by default", () => {
    const p = load();
    expect(p.getPrefs("anyone")).toEqual({
      job_awaiting_signature:            true,
      job_awaiting_contractor_signature: true,
      bid_accepted:                      true,
      bid_declined:                      true,
    });
    expect(p.wantsPush("anyone", "bid_declined")).toBe(true);
  });

  it("merges changes and keeps them per user", () => {
    const p = load();
    expect(p.setPrefs("c-1", { bid_declined: false })?.bid_declined).toBe(false);
    p.setPrefs("c-1", { bid_accepted: false });
    expect(p.getPrefs("c-1")).toMatchObject({ bid_declined: false, bid_accepted: false, job_awaiting_contractor_signature: true });
    expect(p.getPrefs("c-2").bid_declined).toBe(true);
    expect(p.wantsPush("c-1", "bid_declined")).toBe(false);
  });

  it("rejects unknown kinds and non-boolean values without saving anything", () => {
    const p = load();
    expect(p.setPrefs("c-1", { bid_declined: false, new_lead: false })).toBeNull();
    expect(p.setPrefs("c-1", { bid_declined: "no" })).toBeNull();
    expect(p.setPrefs("c-1", null)).toBeNull();
    expect(p.setPrefs("c-1", [true])).toBeNull();
    expect(p.getPrefs("c-1").bid_declined).toBe(true);
  });

  it("always sends kinds that have no preference (new leads use the profile flag)", () => {
    expect(load().wantsPush("c-1", "new_lead")).toBe(true);
  });

  it("survives a restart", () => {
    load().setPrefs("c-1", { job_awaiting_contractor_signature: false });
    jest.resetModules();
    expect(load().getPrefs("c-1").job_awaiting_contractor_signature).toBe(false);
  });
});
