/**
 * /verify-record E2E — checking a signed copy of a report or certificate (public).
 *
 * VR.1  a valid signed copy, signed with the published key → "Signature valid" + the statement
 * VR.2  the same copy with one character of the statement changed → "doesn't match"
 * VR.3  a valid copy signed with some other key → valid, but flagged as not HomeGentic's key
 * VR.4  something that isn't a signed copy → a readable error
 *
 * The published key comes from window.__e2e_attestation_key (services/attestation.ts);
 * the copies are signed here with Node's Ed25519.
 */

import { test, expect, type Page } from "@playwright/test";
import { generateKeyPairSync, sign, type KeyObject } from "crypto";

function rawPublicKey(k: KeyObject): string {
  // SPKI DER for Ed25519 is a 12-byte header followed by the 32-byte key.
  return (k.export({ format: "der", type: "spki" }) as Buffer).subarray(12).toString("hex");
}

const homegentic = generateKeyPairSync("ed25519");
const stranger   = generateKeyPairSync("ed25519");

const STATEMENT = JSON.stringify({
  type: "homegentic.report", v: 1, issuer: "report-canister", snapshotId: "SNAP_1", propertyId: "P1",
  generatedAtMs: Date.UTC(2026, 9, 19),
  property: { address: "12 Elm St", city: "Raleigh", state: "NC", verificationLevel: "Basic" },
  score: 72,
  hidden: { amounts: false, contractors: false, permits: false, descriptions: true },
  totals: { jobs: 1, verifiedJobs: 1, diyJobs: 0, permits: 0, amountCents: 1400000 },
  jobs: [{ date: "2026-05-01", serviceType: "Roofing", isDiy: false, verified: true, amountCents: 1400000 }],
});

function signedCopy(message: string, keys = homegentic, signedMessage = message): string {
  return JSON.stringify({
    format: "homegentic.signed-record", v: 1, algorithm: "ed25519", keyName: "test_key_1",
    publicKey: rawPublicKey(keys.publicKey),
    signature: sign(null, Buffer.from(signedMessage), keys.privateKey).toString("hex"),
    message,
  });
}

async function open(page: Page) {
  const hex = rawPublicKey(homegentic.publicKey);
  await page.addInitScript((h: string) => {
    const bytes = new Uint8Array(h.match(/../g)!.map((b) => parseInt(b, 16)));
    (window as any).__e2e_attestation_key = { keyName: "test_key_1", publicKey: bytes };
  }, hex);
  await page.goto("/verify-record");
  await expect(page.getByRole("heading", { name: "Check a signed record" })).toBeVisible();
  await expect(page.getByTestId("published-key")).toContainText(hex);
}

async function check(page: Page, text: string) {
  await page.getByLabel("Signed copy contents").fill(text);
  await page.getByRole("button", { name: "Check signature" }).click();
  return page.getByTestId("verify-result");
}

test.describe("VR — VerifyRecordPage (/verify-record)", () => {
  test("VR.1 a valid copy shows what was signed", async ({ page }) => {
    await open(page);
    const result = await check(page, signedCopy(STATEMENT));
    await expect(result).toContainText("Signature valid");
    await expect(result).toContainText("Signed with HomeGentic's published key");
    await expect(result).toContainText("12 Elm St");
    await expect(result).toContainText("72");
    await expect(result).toContainText("descriptions");   // hidden by the owner
  });

  test("VR.2 an altered copy fails", async ({ page }) => {
    await open(page);
    const altered = STATEMENT.replace('"score":72', '"score":92');
    const result = await check(page, signedCopy(altered, homegentic, STATEMENT));
    await expect(result).toContainText("The signature doesn't match");
  });

  test("VR.3 a copy signed with another key is flagged", async ({ page }) => {
    await open(page);
    const result = await check(page, signedCopy(STATEMENT, stranger));
    await expect(result).toContainText("Signature valid");
    await expect(result).toContainText("doesn't match HomeGentic's current published key");
  });

  test("VR.4 something else gets a readable error", async ({ page }) => {
    await open(page);
    await expect(await check(page, "not json")).toContainText("This file isn't valid JSON.");
    await expect(await check(page, '{"hello":1}')).toContainText("This isn't a HomeGentic signed copy.");
  });
});
