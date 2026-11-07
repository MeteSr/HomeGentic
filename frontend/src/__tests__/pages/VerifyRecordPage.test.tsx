/**
 * /verify-record checks a signed copy in the browser (test-gap audit
 * 2026-11-03, M3). Real Ed25519 signatures; only the published-key lookup is
 * mocked.
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateKeyPairSync, sign } from "crypto";

const getPublishedKey = vi.hoisted(() => vi.fn());
vi.mock("@/services/attestation", async (orig) => {
  const actual = await orig<typeof import("@/services/attestation")>();
  return { ...actual, attestationService: { ...actual.attestationService, getPublishedKey } };
});
vi.mock("@/components/PageHead", () => ({ PageHead: () => null }));
vi.mock("@/components/PublicNav", () => ({ PublicNav: () => null }));
vi.mock("@/components/PublicFooter", () => ({ PublicFooter: () => null }));

import VerifyRecordPage from "@/pages/VerifyRecordPage";

const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");
function keypair() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const raw = new Uint8Array(publicKey.export({ format: "der", type: "spki" }).subarray(-32));
  return { raw, privateKey };
}
function signedCopy(statement: object, k = keypair()) {
  const message = JSON.stringify(statement);
  return {
    k,
    text: JSON.stringify({
      format: "homegentic.signed-record",
      v: 1,
      algorithm: "ed25519",
      keyName: "key_1",
      message,
      signature: hex(sign(null, Buffer.from(message), k.privateKey)),
      publicKey: hex(k.raw),
    }),
  };
}
const REPORT = {
  type: "homegentic.report",
  property: { address: "9 Palm Court", city: "Orlando", state: "FL", verificationLevel: "Basic" },
  generatedAtMs: 1_790_000_000_000,
  score: 82,
  totals: { jobs: 2, verifiedJobs: 1, amountCents: 125_000 },
  hidden: { contractors: true, permits: false },
  jobs: [
    { date: "2026-01-02", serviceType: "HVAC", verified: true, amountCents: 100_000 },
    { date: "2026-03-04", serviceType: "Painting", isDiy: true, verified: false },
  ],
};

const paste = (text: string) => {
  fireEvent.change(screen.getByLabelText("Signed copy contents"), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "Check signature" }));
};

beforeEach(() => getPublishedKey.mockReset());

describe("VerifyRecordPage", () => {
  it("a report signed with the published key is valid and shows what it says", async () => {
    const copy = signedCopy(REPORT);
    getPublishedKey.mockResolvedValue({ keyName: "key_1", publicKey: copy.k.raw });
    render(<VerifyRecordPage />);
    await waitFor(() => expect(screen.getByTestId("published-key")).toHaveTextContent(`${hex(copy.k.raw)} (key_1)`));
    paste(copy.text);
    const result = await screen.findByTestId("verify-result");
    expect(result).toHaveTextContent("Signature valid");
    expect(result).toHaveTextContent("Signed with HomeGentic's published key");
    expect(result).toHaveTextContent("9 Palm Court, Orlando FL");
    expect(result).toHaveTextContent("2 (1 verified)");
    expect(result).toHaveTextContent("contractors");
    expect(result).toHaveTextContent("Painting (DIY)");
    expect(result).toHaveTextContent("Hidden");
  });

  it("a valid signature from another key is flagged as not HomeGentic's current key", async () => {
    getPublishedKey.mockResolvedValue({ keyName: "key_1", publicKey: keypair().raw });
    render(<VerifyRecordPage />);
    paste(signedCopy(REPORT).text);
    expect(await screen.findByTestId("verify-result")).toHaveTextContent(
      "doesn't match HomeGentic's current published key",
    );
  });

  it("a changed message fails the check", async () => {
    getPublishedKey.mockResolvedValue(null);
    render(<VerifyRecordPage />);
    const copy = JSON.parse(signedCopy(REPORT).text);
    copy.message = copy.message.replace("82", "99");
    paste(JSON.stringify(copy));
    expect(await screen.findByTestId("verify-result")).toHaveTextContent("The signature doesn't match");
  });

  it("shows a score certificate's fields", async () => {
    getPublishedKey.mockResolvedValue(null);
    render(<VerifyRecordPage />);
    expect(await screen.findByText("Not available right now.")).toBeInTheDocument();
    paste(
      signedCopy({
        type: "homegentic.scoreCertificate",
        certificate: { address: "1 Elm", city: "Austin", state: "TX", score: 77, certified: true, verifiedJobCount: 4 },
      }).text,
    );
    const result = await screen.findByTestId("verify-result");
    expect(result).toHaveTextContent("Score certificate");
    expect(result).toHaveTextContent("1 Elm, Austin TX");
    expect(result).toHaveTextContent("HomeGentic CertifiedYes");
  });

  it("says when it can't display a valid record of an unknown kind", async () => {
    getPublishedKey.mockResolvedValue(null);
    render(<VerifyRecordPage />);
    paste(signedCopy({ type: "something.else" }).text);
    expect(await screen.findByTestId("verify-result")).toHaveTextContent("doesn't know how to display");
  });

  it("explains a file that isn't a signed copy", async () => {
    getPublishedKey.mockResolvedValue(null);
    render(<VerifyRecordPage />);
    paste("not json");
    expect(await screen.findByTestId("verify-result")).toHaveTextContent("This file isn't valid JSON.");
    paste(JSON.stringify({ message: "x" }));
    await waitFor(() =>
      expect(screen.getByTestId("verify-result")).toHaveTextContent("This isn't a HomeGentic signed copy."),
    );
  });

  it("reads an opened file and checks it", async () => {
    getPublishedKey.mockResolvedValue(null);
    render(<VerifyRecordPage />);
    const { text } = signedCopy(REPORT);
    const file = new File([text], "signed-copy.json", { type: "application/json" });
    fireEvent.change(screen.getByLabelText("Signed copy file"), { target: { files: [file] } });
    expect(await screen.findByTestId("verify-result")).toHaveTextContent("Signature valid");
    expect(screen.getByLabelText("Signed copy contents")).toHaveValue(text);
  });

  it("the check button waits for some text", () => {
    getPublishedKey.mockResolvedValue(null);
    render(<VerifyRecordPage />);
    expect(screen.getByRole("button", { name: "Check signature" })).toBeDisabled();
  });
});
