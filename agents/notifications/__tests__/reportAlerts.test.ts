/**
 * @jest-environment node
 */
// Buyer report alerts (/check "notify me"): request validation and limits,
// the endpoint, and the pass that emails a buyer once a public report exists.
jest.mock("web-push", () => ({
  setVapidDetails:   jest.fn(),
  sendNotification:  jest.fn(),
  generateVAPIDKeys: jest.fn(() => ({ publicKey: "BPub", privateKey: "Priv" })), // gitleaks:allow
}));

import request from "supertest";
import { buildApp } from "../server";
import {
  addAlert, listAlerts, resetAlerts, runReportAlerts, renderReportAlert,
  MAX_AGE_MS, MAX_PER_EMAIL, MAX_PER_ADDRESS, type ReportAlertDeps,
} from "../reportAlerts";

const MATCH = { token: "RPT_abc", address: "12 Main St", city: "Orlando", state: "FL", zipCode: "32801" };

function deps(over: Partial<ReportAlertDeps> = {}): ReportAlertDeps & { send: jest.Mock; find: jest.Mock } {
  return {
    emailEnabled: () => true,
    find:         jest.fn(async () => null),
    send:         jest.fn(async () => undefined),
    ...over,
  } as any;
}

beforeEach(() => {
  resetAlerts();
  delete process.env.RESEND_API_KEY;
  delete process.env.CANISTER_ID_REPORT;
});

describe("addAlert", () => {
  it("stores a normalized request once", () => {
    expect(addAlert(" 12  Main St, ", "Buyer@Example.com")).toBe("added");
    expect(addAlert("12 main st", "buyer@example.com")).toBe("exists");
    expect(listAlerts()).toEqual([expect.objectContaining({ address: "12 main st", email: "buyer@example.com" })]);
  });

  it("rejects a bad email or an address without a number", () => {
    expect(addAlert("12 Main St", "not-an-email")).toBe("invalid");
    expect(addAlert("Main Street", "b@example.com")).toBe("invalid");
    expect(addAlert(12, "b@example.com")).toBe("invalid");
    expect(listAlerts()).toHaveLength(0);
  });

  it("caps addresses per email and emails per address", () => {
    for (let i = 0; i < MAX_PER_EMAIL; i++) expect(addAlert(`${i + 1} Oak Ave`, "b@example.com")).toBe("added");
    expect(addAlert("99 Oak Ave", "b@example.com")).toBe("limit");
    for (let i = 0; i < MAX_PER_ADDRESS; i++) expect(addAlert("1 Elm St", `p${i}@example.com`)).toBe("added");
    expect(addAlert("1 Elm St", "late@example.com")).toBe("limit");
  });
});

describe("runReportAlerts", () => {
  it("emails every buyer for a matched address once, then forgets them", async () => {
    addAlert("12 Main St", "a@example.com");
    addAlert("12 Main St", "b@example.com");
    addAlert("40 Pine Rd", "c@example.com");
    const d = deps({ find: jest.fn(async (addr: string) => (addr === "12 main st" ? MATCH : null)) as any });

    expect(await runReportAlerts(Date.now(), d)).toBe(2);
    expect(d.find).toHaveBeenCalledTimes(2);   // one lookup per address
    expect(d.send.mock.calls.map((c) => c[0]).sort()).toEqual(["a@example.com", "b@example.com"]);
    expect(listAlerts().map((a) => a.email)).toEqual(["c@example.com"]);

    expect(await runReportAlerts(Date.now(), d)).toBe(0);
    expect(d.send).toHaveBeenCalledTimes(2);
  });

  it("keeps a request whose email failed, for the next pass", async () => {
    addAlert("12 Main St", "a@example.com");
    const d = deps({ find: jest.fn(async () => MATCH) as any, send: jest.fn(async () => { throw new Error("Resend 500"); }) as any });
    expect(await runReportAlerts(Date.now(), d)).toBe(0);
    expect(listAlerts()).toHaveLength(1);
  });

  it("drops requests older than 180 days without looking them up", async () => {
    const now = Date.now();
    addAlert("12 Main St", "a@example.com", now - MAX_AGE_MS - 1);
    const d = deps({ find: jest.fn(async () => MATCH) as any });
    expect(await runReportAlerts(now, d)).toBe(0);
    expect(d.find).not.toHaveBeenCalled();
    expect(listAlerts()).toHaveLength(0);
  });

  it("does nothing when email is off", async () => {
    addAlert("12 Main St", "a@example.com");
    const d = deps({ emailEnabled: () => false, find: jest.fn(async () => MATCH) as any });
    expect(await runReportAlerts(Date.now(), d)).toBe(0);
    expect(listAlerts()).toHaveLength(1);
  });

  it("links to the public report and says it is the only email", () => {
    const msg = renderReportAlert(MATCH);
    expect(msg.text).toContain("/report/RPT_abc");
    expect(msg.text).toContain("12 Main St, Orlando, FL 32801");
    expect(msg.text).toMatch(/only email/);
  });
});

describe("POST /api/report-alerts", () => {
  const app = buildApp();

  it("returns 503 when email or the report canister isn't configured", async () => {
    const res = await request(app).post("/api/report-alerts").send({ address: "12 Main St", email: "a@example.com" });
    expect(res.status).toBe(503);
  });

  it("stores a valid request and rejects a bad one", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.CANISTER_ID_REPORT = "aaaaa-aa";
    expect((await request(app).post("/api/report-alerts").send({ address: "12 Main St", email: "a@example.com" })).status).toBe(201);
    expect((await request(app).post("/api/report-alerts").send({ address: "12 Main St", email: "a@example.com" })).status).toBe(200);
    expect((await request(app).post("/api/report-alerts").send({ address: "12 Main St", email: "nope" })).status).toBe(400);
    expect(listAlerts()).toHaveLength(1);
  });
});
