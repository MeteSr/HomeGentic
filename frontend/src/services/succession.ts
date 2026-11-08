/**
 * #724: the successor (legacy contact) for a home record, on the property
 * canister.
 *
 * The owner names a successor and gets a successor link to give them or keep
 * with their estate papers (setSuccessor / getSuccessor / removeSuccessor).
 * Whoever holds the link can open a claim with a proof document
 * (openSuccessionClaim); a HomeGentic admin reviews it
 * (listSuccessionClaimsForReview / getSuccessionProof / reviewSuccessionClaim);
 * the owner or a co-owner can cancel it (cancelSuccessionClaim); and once it is
 * approved and 30 days have passed since it was opened, the claimant takes
 * over the record (completeSuccessionClaim). HomeGentic passes on the record
 * only; it doesn't transfer the property.
 *
 * E2E: window.__e2e_succession = { successors: { [propertyId]: Successor },
 * invites: { [token]: SuccessionInvite }, claims: SuccessionClaim[],
 * reviews?: SuccessionReview[] }.
 */
import { lazyActor } from "./lazyActor";
import { idlFactory } from "@homegentic/shared/declarations/property";
import type { _SERVICE as PropertyCanister } from "@homegentic/shared/types/property";
import type * as PropertyTypes from "@homegentic/shared/types/property";
import { canisterError, variant } from "./candid";

const PROPERTY_CANISTER_ID = (process.env as any).PROPERTY_CANISTER_ID || "";
const getActor = lazyActor<PropertyCanister>(idlFactory, PROPERTY_CANISTER_ID);

export type ProofKind = "DeathCertificate" | "LettersOfAdministration" | "LettersTestamentary" | "TrustDocument";

export const PROOF_KIND_LABELS: Record<ProofKind, string> = {
  DeathCertificate: "Death certificate",
  LettersOfAdministration: "Letters of administration",
  LettersTestamentary: "Letters testamentary",
  TrustDocument: "Trust document naming the trustee",
};

/** The canister's limit (Succession.MAX_PROOF_BYTES). */
export const MAX_PROOF_BYTES = 1_800_000;
export const PROOF_TYPES = ["application/pdf", "image/jpeg", "image/png"];
/** The waiting period, in days (Succession.WAIT_DAYS). */
export const WAIT_DAYS = 30;

export interface SuccessorInput {
  name: string;
  email: string;
  relationship: string;
}

export interface Successor extends SuccessorInput {
  token: string;
  namedAt: number;
}

export type ClaimStatus =
  | { tag: "AwaitingReview" }
  | { tag: "Approved"; at: number }
  | { tag: "Rejected"; at: number; reason: string }
  | { tag: "Cancelled"; at: number; by: string }
  | { tag: "Completed"; at: number };

export interface SuccessionClaim {
  id: string;
  propertyId: string;
  claimant: string;
  claimantName: string;
  proofKind: ProofKind;
  fileName: string;
  mimeType: string;
  proofSize: number;
  note: string;
  openedAt: number;
  waitEndsAt: number;
  status: ClaimStatus;
}

export interface SuccessionInvite {
  propertyId: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  successorName: string;
  waitDays: number;
}

export interface SuccessionReview {
  claim: SuccessionClaim;
  address: string;
  successor: Successor | null;
}

export interface ClaimDraft {
  claimantName: string;
  proofKind: ProofKind;
  note: string;
}

export function successorLink(token: string): string {
  return `${window.location.origin}/successor/${token}`;
}

/** Why `file` can't be sent as proof, or null. */
export function checkProofFile(file: File): string | null {
  if (!PROOF_TYPES.includes(file.type)) return "Attach a PDF, JPEG or PNG file.";
  if (file.size === 0) return "That file is empty.";
  if (file.size > MAX_PROOF_BYTES) return "The document is over 1.8 MB. Scan it at a lower resolution.";
  return null;
}

/** True while a claim can still be cancelled or finished. */
export function isOpen(c: SuccessionClaim): boolean {
  return c.status.tag === "AwaitingReview" || c.status.tag === "Approved";
}

const nsToMs = (ns: bigint) => Math.floor(Number(ns) / 1_000_000);

function statusFrom(s: PropertyTypes.SuccessionClaimStatus): ClaimStatus {
  if ("Approved" in s) return { tag: "Approved", at: nsToMs(s.Approved.at) };
  if ("Rejected" in s) return { tag: "Rejected", at: nsToMs(s.Rejected.at), reason: s.Rejected.reason };
  if ("Cancelled" in s) return { tag: "Cancelled", at: nsToMs(s.Cancelled.at), by: s.Cancelled.by.toText() };
  if ("Completed" in s) return { tag: "Completed", at: nsToMs(s.Completed.at) };
  return { tag: "AwaitingReview" };
}

function claimFrom(c: PropertyTypes.SuccessionClaim): SuccessionClaim {
  return {
    id: c.id,
    propertyId: c.propertyId,
    claimant: c.claimant.toText(),
    claimantName: c.claimantName,
    proofKind: Object.keys(c.proofKind)[0] as ProofKind,
    fileName: c.fileName,
    mimeType: c.mimeType,
    proofSize: Number(c.proofSize),
    note: c.note,
    openedAt: nsToMs(c.openedAt),
    waitEndsAt: nsToMs(c.waitEndsAt),
    status: statusFrom(c.status),
  };
}

function successorFrom(s: PropertyTypes.Successor): Successor {
  return { name: s.name, email: s.email, relationship: s.relationship, token: s.token, namedAt: nsToMs(s.namedAt) };
}

function unwrap<T>(res: { ok: T } | { err: PropertyTypes.Error }): T {
  if ("err" in res) throw canisterError(res.err);
  return res.ok;
}

interface E2EStore {
  successors: Record<string, Successor>;
  invites: Record<string, SuccessionInvite>;
  claims: SuccessionClaim[];
  reviews?: SuccessionReview[];
}

function e2e(): E2EStore | undefined {
  return typeof window !== "undefined" ? (window as any).__e2e_succession : undefined;
}

function e2eClaim(s: E2EStore, id: string): SuccessionClaim {
  const c = s.claims.find((x) => x.id === id);
  if (!c) throw new Error("Claim not found");
  return c;
}

function e2eSet(s: E2EStore, claim: SuccessionClaim): SuccessionClaim {
  s.claims = s.claims.map((x) => (x.id === claim.id ? claim : x));
  return claim;
}

export const successionService = {
  /** The home's successor, or null (none named, or the caller isn't the owner). */
  async getSuccessor(propertyId: string): Promise<Successor | null> {
    const s = e2e();
    if (s) return s.successors[propertyId] ?? null;
    const res = await (await getActor()).getSuccessor(propertyId);
    if ("err" in res) {
      if ("NotAuthorized" in res.err) return null;
      throw canisterError(res.err);
    }
    return res.ok.length ? successorFrom(res.ok[0]) : null;
  },

  /** Name (or rename) the successor. Issues a new link; the old one stops working. */
  async setSuccessor(propertyId: string, input: SuccessorInput): Promise<Successor> {
    const s = e2e();
    if (s) {
      const rec = { ...input, token: `e2e-${propertyId}-${Date.now()}`, namedAt: Date.now() };
      s.successors[propertyId] = rec;
      return rec;
    }
    return successorFrom(unwrap(await (await getActor()).setSuccessor(propertyId, input)));
  },

  async removeSuccessor(propertyId: string): Promise<void> {
    const s = e2e();
    if (s) {
      delete s.successors[propertyId];
      return;
    }
    unwrap(await (await getActor()).removeSuccessor(propertyId));
  },

  /** What a successor link shows, or null for an unknown link. */
  async getInvite(token: string): Promise<SuccessionInvite | null> {
    const s = e2e();
    if (s) return s.invites[token] ?? null;
    const res = await (await getActor()).getSuccessionInvite(token);
    if (!res.length) return null;
    const { property: p, successorName, waitDays } = res[0];
    return {
      propertyId: p.id,
      address: p.address,
      city: p.city,
      state: p.state,
      zipCode: p.zipCode,
      successorName,
      waitDays: Number(waitDays),
    };
  },

  /** Open a claim from a successor link, sending the proof file. */
  async openClaim(token: string, draft: ClaimDraft, file: File): Promise<SuccessionClaim> {
    const problem = checkProofFile(file);
    if (problem) throw new Error(problem);
    const s = e2e();
    if (s) {
      const inv = s.invites[token];
      if (!inv) throw new Error("This successor link isn't valid.");
      const now = Date.now();
      const claim: SuccessionClaim = {
        id: `sc-e2e-${s.claims.length + 1}`,
        propertyId: inv.propertyId,
        claimant: "e2e",
        ...draft,
        fileName: file.name,
        mimeType: file.type,
        proofSize: file.size,
        openedAt: now,
        waitEndsAt: now + WAIT_DAYS * 86_400_000,
        status: { tag: "AwaitingReview" },
      };
      s.claims.push(claim);
      return claim;
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const res = await (
      await getActor()
    ).openSuccessionClaim(
      token,
      {
        claimantName: draft.claimantName,
        proofKind: variant<PropertyTypes.SuccessionProofKind>(draft.proofKind),
        fileName: file.name,
        mimeType: file.type,
        note: draft.note,
      },
      bytes,
    );
    return claimFrom(unwrap(res));
  },

  /** The home's open claim (owner and co-owners), or null. */
  async getOpenClaim(propertyId: string): Promise<SuccessionClaim | null> {
    const s = e2e();
    if (s) return s.claims.find((c) => c.propertyId === propertyId && isOpen(c)) ?? null;
    const res = await (await getActor()).getOpenSuccessionClaim(propertyId);
    if ("err" in res) {
      if ("NotAuthorized" in res.err) return null;
      throw canisterError(res.err);
    }
    return res.ok.length ? claimFrom(res.ok[0]) : null;
  },

  /** The claims the signed-in user opened, newest first. */
  async getMyClaims(): Promise<SuccessionClaim[]> {
    const s = e2e();
    if (s) return [...s.claims].sort((a, b) => b.openedAt - a.openedAt);
    return (await (await getActor()).getMySuccessionClaims()).map(claimFrom);
  },

  async cancelClaim(claimId: string): Promise<SuccessionClaim> {
    const s = e2e();
    if (s) return e2eSet(s, { ...e2eClaim(s, claimId), status: { tag: "Cancelled", at: Date.now(), by: "e2e" } });
    return claimFrom(unwrap(await (await getActor()).cancelSuccessionClaim(claimId)));
  },

  /** Take over the home record (approved, and the wait is over). */
  async completeClaim(claimId: string): Promise<void> {
    const s = e2e();
    if (s) {
      e2eSet(s, { ...e2eClaim(s, claimId), status: { tag: "Completed", at: Date.now() } });
      return;
    }
    unwrap(await (await getActor()).completeSuccessionClaim(claimId));
  },

  /** Admin: claims waiting for review, oldest first. */
  async listForReview(): Promise<SuccessionReview[]> {
    const s = e2e();
    if (s) return s.reviews ?? [];
    const rows = unwrap(await (await getActor()).listSuccessionClaimsForReview());
    return rows.map((r) => ({
      claim: claimFrom(r.claim),
      address: `${r.property.address}, ${r.property.city}, ${r.property.state} ${r.property.zipCode}`,
      successor: r.successor.length ? successorFrom(r.successor[0]) : null,
    }));
  },

  /** Admin: a claim's proof document. */
  async getProof(claimId: string): Promise<{ fileName: string; blob: Blob }> {
    const p = unwrap(await (await getActor()).getSuccessionProof(claimId));
    return { fileName: p.fileName, blob: new Blob([new Uint8Array(p.data)], { type: p.mimeType }) };
  },

  /** Admin: approve, or reject with a reason the claimant reads. */
  async review(claimId: string, approve: boolean, reason: string): Promise<SuccessionClaim> {
    const s = e2e();
    if (s) {
      const status: ClaimStatus = approve
        ? { tag: "Approved", at: Date.now() }
        : { tag: "Rejected", at: Date.now(), reason };
      s.reviews = (s.reviews ?? []).filter((r) => r.claim.id !== claimId);
      return { ...(s.claims.find((c) => c.id === claimId) as SuccessionClaim), status };
    }
    return claimFrom(unwrap(await (await getActor()).reviewSuccessionClaim(claimId, approve, reason)));
  },
};
