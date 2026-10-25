/**
 * @jest-environment node
 */
// The weekly Home Pulse email: what goes in it, when it runs, and that a
// restart never emails anyone twice.
jest.mock("web-push", () => ({
  setVapidDetails:   jest.fn(),
  sendNotification:  jest.fn(),
  generateVAPIDKeys: jest.fn(() => ({ publicKey: "BPub", privateKey: "Priv" })), // gitleaks:allow
}));

import request from "supertest";
import {
  awaitingSignature, buildSection, getPulseState, isoWeek, pulseDue, renderPulse, resetPulseState,
  runPulse, seasonalSystem, unsubscribeUrl, type PulseDeps,
} from "../pulse";
import { getPrefs } from "../prefs";
import { scoreBreakdown } from "../../../packages/shared/src/score";
import { buildApp } from "../server";
import type { PulseJob, PulseProperty } from "../types";

// Monday 2026-10-19 14:00 UTC (ISO week 43); autumn.
const MONDAY = Date.UTC(2026, 9, 19, 14);

const HOUSE: PulseProperty = {
  id: "P1", address: "12 Elm St", city: "Raleigh", state: "NC", zipCode: "27601", yearBuilt: 2000,
};

function job(over: Partial<PulseJob> = {}): PulseJob {
  return {
    id: "J1", propertyId: "P1", title: "Furnace service", serviceType: "HVAC", contractorName: "Bell & Sons",
    amountCents: 18_000, completedAtMs: Date.UTC(2025, 9, 1), warrantyMonths: null, isDiy: false,
    status: "Verified", verified: true, homeownerSigned: true, contractorSigned: true, ...over,
  };
}

describe("dates", () => {
  it("names ISO weeks, including across a year boundary", () => {
    expect(isoWeek(MONDAY)).toBe("2026-W43");
    expect(isoWeek(Date.UTC(2027, 0, 1))).toBe("2026-W53");
    expect(isoWeek(Date.UTC(2024, 11, 30))).toBe("2025-W01");
  });

  it("is due Monday from the send hour, and Tuesday as a catch-up", () => {
    expect(pulseDue(Date.UTC(2026, 9, 19, 12), 13)).toBe(false);
    expect(pulseDue(Date.UTC(2026, 9, 19, 13), 13)).toBe(true);
    expect(pulseDue(Date.UTC(2026, 9, 20, 2), 13)).toBe(true);
    expect(pulseDue(Date.UTC(2026, 9, 21, 14), 13)).toBe(false);
  });
});

describe("buildSection", () => {
  it("leads with jobs waiting on the homeowner's signature", () => {
    const pending = job({ id: "J2", title: "Gutter cleaning", status: "PendingHomeownerApproval", verified: false, homeownerSigned: false });
    const s = buildSection(HOUSE, [job(), pending], [], MONDAY);
    expect(s.items[0]).toMatchObject({ tag: "SIGN OFF", title: "Sign off: Gutter cleaning" });
    expect(s.items[0].body).toContain("Bell & Sons");
  });

  it("doesn't ask for a signature on declined or already-signed jobs", () => {
    expect(awaitingSignature(job({ status: "RejectedByHomeowner", verified: false, homeownerSigned: false, contractorSigned: true }))).toBe(false);
    expect(awaitingSignature(job({ status: "Completed", verified: false, homeownerSigned: true, contractorSigned: false }))).toBe(false);
    expect(awaitingSignature(job({ status: "Completed", verified: false, homeownerSigned: false, contractorSigned: true }))).toBe(true);
  });

  it("flags systems past their rated life the way the score counts age", () => {
    // Built 2000: HVAC (18 yrs) is past; a $14k roof in 2020 resets Roofing.
    const s = buildSection(HOUSE, [], [
      { serviceType: "Roofing", completedYear: 2020, amountCents: 1_400_000, isDiy: false, isVerified: true },
      { serviceType: "HVAC",    completedYear: 2024, amountCents: 9_000,     isDiy: false, isVerified: true },
    ], MONDAY);
    const past = s.items.filter((i) => i.tag === "PAST RATED LIFE").map((i) => i.title);
    expect(past).toContain("Your HVAC system is past its rated life");
    expect(past.some((t) => t.includes("roof"))).toBe(false);
    expect(s.items.find((i) => i.title.includes("HVAC"))!.body).toContain("counts from 2000");
  });

  it("includes warranties ending in the next 60 days only", () => {
    const soon  = job({ id: "W1", title: "Water heater", warrantyMonths: 12, completedAtMs: Date.UTC(2025, 10, 15) });
    const later = job({ id: "W2", title: "Roof", warrantyMonths: 120, completedAtMs: Date.UTC(2025, 10, 15) });
    const gone  = job({ id: "W3", title: "Dishwasher", warrantyMonths: 6, completedAtMs: Date.UTC(2025, 0, 1) });
    const s = buildSection({ ...HOUSE, yearBuilt: 2024 }, [soon, later, gone], [], MONDAY);
    const w = s.items.filter((i) => i.tag === "WARRANTY");
    expect(w).toHaveLength(1);
    expect(w[0].title).toBe("Water heater: warranty ends Nov 15, 2026");
  });

  it("adds this season's priorities for the climate zone, with the last matching job", () => {
    const s = buildSection({ ...HOUSE, yearBuilt: 2024 }, [job()], [], MONDAY);
    const seasonal = s.items.filter((i) => i.tag === "SEASONAL");
    expect(s.season).toBe("fall");
    expect(s.zone.zone).toBe(4);
    expect(seasonal.map((i) => i.title)).toContain("Service furnace before heating season");
    expect(seasonal.find((i) => i.title.startsWith("Service furnace"))!.body)
      .toContain("Last HVAC job on record: Oct 2025, by Bell & Sons for $180.");
  });

  it("scores from the canister's snapshots, and has no score without jobs", () => {
    expect(buildSection(HOUSE, [], [], MONDAY).score).toBeNull();
    const snaps = [{ serviceType: "Roofing", completedYear: 2026, amountCents: 1_400_000, isDiy: false, isVerified: true }];
    // The shared formula over the same inputs the market canister scores.
    expect(buildSection(HOUSE, [], snaps, MONDAY).score).toBe(scoreBreakdown(snaps, 2000, 2026).total);
  });

  it("skips system-life items when the year built is unknown", () => {
    const s = buildSection({ ...HOUSE, yearBuilt: 0 }, [], [], MONDAY);
    expect(s.items.every((i) => i.tag === "SEASONAL")).toBe(true);
  });

  it("maps seasonal tasks to systems", () => {
    expect(seasonalSystem("AC tune-up")).toBe("HVAC");
    expect(seasonalSystem("Clean gutters of fall leaves")).toBe("Roofing");
    expect(seasonalSystem("Insulate exposed pipes")).toBe("Plumbing");
    expect(seasonalSystem("Check attic ventilation")).toBeNull();
  });
});

describe("renderPulse", () => {
  const links = { dashboard: "https://app/dashboard", settings: "https://app/settings", unsubscribe: "https://relay/unsub?x=1&y=2" };

  it("counts what needs attention in the subject and escapes HTML", () => {
    const s = buildSection({ ...HOUSE, address: "<b>12 Elm</b>" },
      [job({ title: "Fix <script>", status: "PendingHomeownerApproval", verified: false, homeownerSigned: false })], [], MONDAY);
    const m = renderPulse([s], 0, links);
    expect(m.subject).toMatch(/^Your Home Pulse: \d+ things? needs? you this week$/);
    expect(m.html).toContain("Fix &lt;script&gt;");
    expect(m.html).not.toContain("<script>");
    expect(m.html).toContain("&lt;b&gt;12 Elm");
    expect(m.html).toContain("https://relay/unsub?x=1&amp;y=2");
    expect(m.text).toContain("Stop these weekly emails: https://relay/unsub?x=1&y=2");
  });

  it("says when nothing is urgent", () => {
    const s = buildSection({ ...HOUSE, yearBuilt: 2025 }, [], [], MONDAY);
    expect(renderPulse([s], 2, links).subject).toBe("Your Home Pulse: nothing urgent this week");
    expect(renderPulse([s], 2, links).text).toContain("And 2 more properties on your dashboard.");
  });
});

describe("runPulse", () => {
  const owners = ["aaaaa-aa", "2vxsx-fae", "rrkah-fqaaa-aaaaa-aaaaq-cai"];

  function deps(over: Partial<PulseDeps> = {}): PulseDeps & { send: jest.Mock } {
    return {
      emailEnabled:  () => true,
      publicUrl:     () => "https://relay.example.com",
      getRecipients: jest.fn(async (after: string | null) => {
        const i = after ? owners.indexOf(after) + 1 : 0;
        return owners.slice(i).map((p) => ({ principal: p, email: `${p}@example.com` }));
      }),
      getProperties: jest.fn(async (o: string) => (o === "2vxsx-fae" ? [] : [HOUSE])),
      getJobs:       jest.fn(async () => [job()]),
      getSnapshots:  jest.fn(async () => []),
      wantsPulse:    () => true,
      send:          jest.fn(async () => undefined),
      pause:         async () => undefined,
      ...over,
    } as PulseDeps & { send: jest.Mock };
  }

  beforeEach(() => resetPulseState());

  it("emails each homeowner with a property once a week, with one-click unsubscribe", async () => {
    const d = deps();
    expect(await runPulse(MONDAY, d)).toBe(2);
    expect(d.send).toHaveBeenCalledTimes(2);
    const [to, , key, headers] = d.send.mock.calls[0];
    expect(to).toBe("aaaaa-aa@example.com");
    expect(key).toBe("pulse:aaaaa-aa:2026-W43");
    expect(headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(headers["List-Unsubscribe"]).toBe(`<${unsubscribeUrl("https://relay.example.com", "aaaaa-aa")}>`);

    // Done for the week: a later check on Monday or Tuesday sends nothing.
    expect(await runPulse(MONDAY + 3_600_000, d)).toBe(0);
    expect(await runPulse(MONDAY + 86_400_000, d)).toBe(0);
    expect(getPulseState()).toMatchObject({ week: "2026-W43", done: true });
  });

  it("doesn't run before Monday's send hour, or without email or a public URL", async () => {
    expect(await runPulse(Date.UTC(2026, 9, 18, 14), deps())).toBe(0);
    expect(await runPulse(MONDAY, deps({ emailEnabled: () => false }))).toBe(0);
    expect(await runPulse(MONDAY, deps({ publicUrl: () => null }))).toBe(0);
  });

  it("skips homeowners who turned it off", async () => {
    const d = deps({ wantsPulse: (p) => p !== "aaaaa-aa" });
    expect(await runPulse(MONDAY, d)).toBe(1);
    expect(d.send.mock.calls[0][0]).toBe("rrkah-fqaaa-aaaaa-aaaaq-cai@example.com");
  });

  it("resumes after the last homeowner handled when a run stops part-way", async () => {
    // A full page (so it asks for the next one), then the next page fails.
    const flaky = deps({
      getRecipients: jest.fn()
        .mockResolvedValueOnce(Array.from({ length: 100 }, () => ({ principal: owners[0], email: "a@example.com" })))
        .mockRejectedValueOnce(new Error("replica unavailable")),
    });
    await runPulse(MONDAY, flaky);
    expect(getPulseState()).toMatchObject({ week: "2026-W43", after: owners[0], done: false });

    const d = deps();
    await runPulse(MONDAY + 3_600_000, d);
    expect((d.getRecipients as jest.Mock).mock.calls[0][0]).toBe(owners[0]);
    expect(d.send.mock.calls.map((c) => c[0])).toEqual(["rrkah-fqaaa-aaaaa-aaaaq-cai@example.com"]);
  });

  it("keeps going when one homeowner's email fails", async () => {
    const d = deps();
    d.send.mockRejectedValueOnce(new Error("Resend 500"));
    expect(await runPulse(MONDAY, d)).toBe(1);
    expect(getPulseState()?.done).toBe(true);
  });
});

describe("/api/email/unsubscribe", () => {
  const app = buildApp();
  const principal = "aaaaa-aa";
  const path = (url: string) => url.replace("https://relay.example.com", "");

  it("GET shows a confirm button and changes nothing", async () => {
    const res = await request(app).get(path(unsubscribeUrl("https://relay.example.com", principal)));
    expect(res.status).toBe(200);
    expect(res.text).toContain("<form method=\"post\">");
    expect(getPrefs(principal).email.weekly_pulse).toBe(true);
  });

  it("POST (including RFC 8058 one-click) turns only the weekly email off", async () => {
    const res = await request(app)
      .post(path(unsubscribeUrl("https://relay.example.com", principal)))
      .type("form").send("List-Unsubscribe=One-Click");
    expect(res.status).toBe(200);
    expect(res.text).toContain("You're unsubscribed");
    expect(getPrefs(principal).email.weekly_pulse).toBe(false);
    expect(getPrefs(principal).email.job_verified).toBe(true);
  });

  it("rejects a wrong token or another principal's token", async () => {
    const other = path(unsubscribeUrl("https://relay.example.com", "2vxsx-fae")).replace("u=2vxsx-fae", "u=rrkah-fqaaa-aaaaa-aaaaq-cai");
    expect((await request(app).post(other)).status).toBe(400);
    expect((await request(app).post("/api/email/unsubscribe?u=x&k=weekly_pulse&t=00")).status).toBe(400);
    expect((await request(app).post("/api/email/unsubscribe?u=x&k=nope&t=00")).status).toBe(400);
    expect(getPrefs("rrkah-fqaaa-aaaaa-aaaaq-cai").email.weekly_pulse).toBe(true);
  });
});
