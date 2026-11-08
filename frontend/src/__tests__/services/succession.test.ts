/**
 * #724 successor service: the owner's successor and link, the successor's
 * claim with its proof file, the owner cancelling, and the admin review.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Principal } from "@icp-sdk/core/principal";

const heir = Principal.fromText("aaaaa-aa");
const owner = Principal.fromText("2vxsx-fae");
const NS = 1_000_000n;
const rawSuccessor = {
  name: "Jordan Rivera",
  email: "jordan@example.com",
  relationship: "Daughter",
  token: "ab".repeat(32),
  namedAt: 1_000n * NS,
};
const rawClaim = (status: object = { AwaitingReview: null }) => ({
  id: "sc-1",
  propertyId: "P1",
  claimant: heir,
  claimantName: "Jordan Rivera",
  proofKind: { LettersTestamentary: null },
  fileName: "letters.pdf",
  mimeType: "application/pdf",
  proofSize: 14n,
  note: "",
  openedAt: 2_000n * NS,
  waitEndsAt: 3_000n * NS,
  status,
});
const rawProperty = { id: "P1", address: "70 Heritage Way", city: "Orlando", state: "FL", zipCode: "32801" };

const mockActor = {
  getSuccessor: vi.fn(async (pid: string) =>
    pid === "theirs" ? { err: { NotAuthorized: null } } : { ok: [rawSuccessor] },
  ),
  setSuccessor: vi.fn(async (_pid: string, input: any) =>
    input.email.includes("@")
      ? { ok: { ...rawSuccessor, ...input } }
      : { err: { InvalidInput: "Enter a valid email address" } },
  ),
  removeSuccessor: vi.fn(async () => ({ ok: null })),
  getSuccessionInvite: vi.fn(async (token: string) =>
    token === "good" ? [{ property: rawProperty, successorName: "Jordan Rivera", waitDays: 30n }] : [],
  ),
  openSuccessionClaim: vi.fn(async (..._a: unknown[]) => ({ ok: rawClaim() })),
  getOpenSuccessionClaim: vi.fn(async () => ({ ok: [rawClaim({ Approved: { at: 2_500n * NS } })] })),
  getMySuccessionClaims: vi.fn(async () => [rawClaim({ Rejected: { at: 2_600n * NS, reason: "Page 2 is missing." } })]),
  cancelSuccessionClaim: vi.fn(async () => ({ ok: rawClaim({ Cancelled: { at: 2_700n * NS, by: owner } }) })),
  completeSuccessionClaim: vi.fn(async () => ({ ok: rawProperty })),
  listSuccessionClaimsForReview: vi.fn(async () => ({
    ok: [{ claim: rawClaim(), property: rawProperty, successor: [rawSuccessor] }],
  })),
  getSuccessionProof: vi.fn(async () => ({
    ok: { fileName: "letters.pdf", mimeType: "application/pdf", data: [0x25, 0x50, 0x44, 0x46] },
  })),
  reviewSuccessionClaim: vi.fn(async (_id: string, approve: boolean, reason: string) =>
    !approve && !reason.trim()
      ? { err: { InvalidInput: "Give the claimant a reason" } }
      : { ok: rawClaim(approve ? { Approved: { at: 1n } } : { Rejected: { at: 1n, reason } }) },
  ),
};

vi.mock("@/services/actor", () => ({ getAgent: vi.fn().mockResolvedValue({}) }));
vi.mock("@icp-sdk/core/agent", () => ({ Actor: { createActor: vi.fn(() => mockActor) } }));

import {
  successionService,
  successorLink,
  checkProofFile,
  MAX_PROOF_BYTES,
  PROOF_KIND_LABELS,
} from "@/services/succession";

const pdf = (bytes = [0x25, 0x50, 0x44, 0x46, 0x2d]) =>
  new File([new Uint8Array(bytes)], "letters.pdf", { type: "application/pdf" });

beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  delete (window as any).__e2e_succession;
});

describe("successor (owner)", () => {
  it("reads, names and removes the successor", async () => {
    const s = await successionService.getSuccessor("P1");
    expect(s).toEqual({
      name: "Jordan Rivera",
      email: "jordan@example.com",
      relationship: "Daughter",
      token: "ab".repeat(32),
      namedAt: 1000,
    });
    expect(await successionService.getSuccessor("theirs")).toBeNull();

    const named = await successionService.setSuccessor("P1", {
      name: "Sam Lee",
      email: "sam@example.com",
      relationship: "",
    });
    expect(named.name).toBe("Sam Lee");
    expect(mockActor.setSuccessor).toHaveBeenCalledWith("P1", {
      name: "Sam Lee",
      email: "sam@example.com",
      relationship: "",
    });
    await expect(
      successionService.setSuccessor("P1", { name: "Sam", email: "nope", relationship: "" }),
    ).rejects.toThrow("Enter a valid email address");

    await successionService.removeSuccessor("P1");
    expect(mockActor.removeSuccessor).toHaveBeenCalledWith("P1");
  });

  it("builds the successor link from the token", () => {
    expect(successorLink("abc")).toBe(`${window.location.origin}/successor/abc`);
  });

  it("reads the open claim with its status and times in ms", async () => {
    const c = await successionService.getOpenClaim("P1");
    expect(c).toMatchObject({
      id: "sc-1",
      claimant: heir.toText(),
      proofKind: "LettersTestamentary",
      openedAt: 2000,
      waitEndsAt: 3000,
    });
    expect(c!.status).toEqual({ tag: "Approved", at: 2500 });
  });

  it("cancels a claim", async () => {
    const c = await successionService.cancelClaim("sc-1");
    expect(c.status).toEqual({ tag: "Cancelled", at: 2700, by: owner.toText() });
  });
});

describe("claim (successor)", () => {
  it("reads what the link shows", async () => {
    expect(await successionService.getInvite("good")).toEqual({
      propertyId: "P1",
      address: "70 Heritage Way",
      city: "Orlando",
      state: "FL",
      zipCode: "32801",
      successorName: "Jordan Rivera",
      waitDays: 30,
    });
    expect(await successionService.getInvite("bad")).toBeNull();
  });

  it("opens a claim with the file's bytes", async () => {
    const c = await successionService.openClaim(
      "good",
      { claimantName: "Jordan Rivera", proofKind: "LettersTestamentary", note: "" },
      pdf(),
    );
    expect(c.status).toEqual({ tag: "AwaitingReview" });
    const [token, input, bytes] = mockActor.openSuccessionClaim.mock.calls[0] as [string, any, Uint8Array];
    expect(token).toBe("good");
    expect(input).toEqual({
      claimantName: "Jordan Rivera",
      proofKind: { LettersTestamentary: null },
      fileName: "letters.pdf",
      mimeType: "application/pdf",
      note: "",
    });
    expect(Array.from(bytes)).toEqual([0x25, 0x50, 0x44, 0x46, 0x2d]);
  });

  it("checks the file before sending it", () => {
    expect(checkProofFile(pdf())).toBeNull();
    expect(checkProofFile(new File(["x"], "a.txt", { type: "text/plain" }))).toMatch(/PDF, JPEG or PNG/);
    expect(
      checkProofFile(new File([new Uint8Array(MAX_PROOF_BYTES + 1)], "big.pdf", { type: "application/pdf" })),
    ).toMatch(/1.8 MB/);
    expect(checkProofFile(new File([], "empty.pdf", { type: "application/pdf" }))).toMatch(/empty/);
  });

  it("lists the caller's claims and finishes one", async () => {
    const [c] = await successionService.getMyClaims();
    expect(c.status).toEqual({ tag: "Rejected", at: 2600, reason: "Page 2 is missing." });
    await successionService.completeClaim("sc-1");
    expect(mockActor.completeSuccessionClaim).toHaveBeenCalledWith("sc-1");
  });

  it("labels every proof kind", () => {
    expect(Object.keys(PROOF_KIND_LABELS).sort()).toEqual([
      "DeathCertificate",
      "LettersOfAdministration",
      "LettersTestamentary",
      "TrustDocument",
    ]);
  });
});

describe("review (admin)", () => {
  it("lists claims, opens the proof and records the decision", async () => {
    const [r] = await successionService.listForReview();
    expect(r.claim.id).toBe("sc-1");
    expect(r.address).toBe("70 Heritage Way, Orlando, FL 32801");
    expect(r.successor?.email).toBe("jordan@example.com");

    const proof = await successionService.getProof("sc-1");
    expect(proof.fileName).toBe("letters.pdf");
    expect(proof.blob.type).toBe("application/pdf");
    expect(proof.blob.size).toBe(4);

    const ok = await successionService.review("sc-1", true, "");
    expect(ok.status.tag).toBe("Approved");
    await expect(successionService.review("sc-1", false, " ")).rejects.toThrow("Give the claimant a reason");
  });
});

describe("e2e store", () => {
  it("works without a canister when window.__e2e_succession is set", async () => {
    (window as any).__e2e_succession = { successors: {}, invites: {}, claims: [] };
    const s = await successionService.setSuccessor("P9", {
      name: "Sam Lee",
      email: "sam@example.com",
      relationship: "Son",
    });
    expect(s.token).toBeTruthy();
    expect(await successionService.getSuccessor("P9")).toEqual(s);
    expect(mockActor.setSuccessor).not.toHaveBeenCalled();
    await successionService.removeSuccessor("P9");
    expect(await successionService.getSuccessor("P9")).toBeNull();
  });
});
