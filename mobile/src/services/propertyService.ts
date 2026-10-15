import { HttpAgent } from "@icp-sdk/core/agent";
import { Principal } from "@icp-sdk/core/principal";
import { idlFactory } from "../declarations/property";
import { actorFor, nsToMs, tag, unwrap } from "./canister";

export type VerificationLevel = "Unverified" | "PendingReview" | "Basic" | "Premium";
export type ManagerRole = "Viewer" | "Manager" | "CoOwner";

export interface Property {
  id:                 string;
  /** Full one-line address: "412 Grandview Ave, Daytona Beach, FL 32118". */
  address:            string;
  street:             string;
  city:               string;
  state:              string;
  zipCode:            string;
  propertyType:       string;
  yearBuilt:          number;
  squareFeet:         number;
  verificationLevel:  VerificationLevel;
  /** "UtilityBill" | "DeedRecord" | "TaxRecord" when verified. */
  verificationMethod: string | null;
  /** Filled in by the score service; the canister doesn't store it. */
  score:              number;
  scoreGrade:         string;
}

export interface PropertyManager {
  principal:       string;
  role:            ManagerRole;
  displayName:     string;
  addedAt:         number;   // ms
  /** null = no limit. */
  spendLimitCents: number | null;
}

export interface ManagerInvite {
  token:       string;
  role:        ManagerRole;
  displayName: string;
  expiresAt:   number;   // ms
}

export interface OwnerNotification {
  id:          number;
  managerName: string;
  description: string;
  timestamp:   number;   // ms
  seen:        boolean;
}

export type ApprovalStatus = "Pending" | "Approved" | "Declined";

export interface ApprovalRequest {
  id:            number;
  requesterName: string;
  description:   string;
  amountCents:   number;
  createdAt:     number;   // ms
  status:        ApprovalStatus;
}

export interface Room {
  id:        string;
  name:      string;
  floorName: string;
  fixtures:  { brand: string; model: string; installedDate: string; warrantyExpiry: string }[];
}

// ── Canister wiring ───────────────────────────────────────────────────────────

const PROPERTY_CANISTER_ID = process.env.EXPO_PUBLIC_PROPERTY_CANISTER_ID ?? "";

function actor(agent?: HttpAgent) {
  return actorFor(idlFactory, PROPERTY_CANISTER_ID, agent);
}

export function fromRaw(raw: any): Property {
  return {
    id:                 String(raw.id),
    address:            `${raw.address}, ${raw.city}, ${raw.state} ${raw.zipCode}`,
    street:             raw.address,
    city:               raw.city,
    state:              raw.state,
    zipCode:            raw.zipCode,
    propertyType:       tag(raw.propertyType),
    yearBuilt:          Number(raw.yearBuilt),
    squareFeet:         Number(raw.squareFeet),
    verificationLevel:  tag<VerificationLevel>(raw.verificationLevel),
    verificationMethod: raw.verificationMethod?.[0] ?? null,
    score:              0,
    scoreGrade:         "-",
  };
}

function fromManager(raw: any): PropertyManager {
  return {
    principal:       raw.principal.toText(),
    role:            tag<ManagerRole>(raw.role),
    displayName:     raw.displayName,
    addedAt:         nsToMs(raw.addedAt),
    spendLimitCents: raw.spendLimitCents.length ? Number(raw.spendLimitCents[0]) : null,
  };
}

// ── Properties ────────────────────────────────────────────────────────────────

export async function getProperties(agent?: HttpAgent): Promise<Property[]> {
  const raw: any[] = await actor(agent).getMyProperties();
  return raw.map(fromRaw);
}

export async function getRooms(propertyId: string, agent?: HttpAgent): Promise<Room[]> {
  const raw: any[] = await actor(agent).getRoomsByProperty(propertyId);
  return raw.map((r) => ({
    id:        r.id,
    name:      r.name,
    floorName: r.floorName,
    fixtures:  r.fixtures.map((f: any) => ({
      brand: f.brand, model: f.model, installedDate: f.installedDate, warrantyExpiry: f.warrantyExpiry,
    })),
  }));
}

// ── Shared access (Pro) ───────────────────────────────────────────────────────

export async function getManagers(propertyId: string, agent?: HttpAgent): Promise<PropertyManager[]> {
  const raw: any[] = unwrap(await actor(agent).getPropertyManagers(propertyId));
  return raw.map(fromManager);
}

/**
 * Creates an invite and returns its bearer token. The invitee opens the claim
 * link (see buildInviteUrl) and signs in to accept.
 */
export async function inviteManager(
  propertyId: string,
  role: ManagerRole,
  displayName: string,
  spendLimitCents: number | null,
  agent?: HttpAgent,
): Promise<ManagerInvite> {
  const raw: any = unwrap(await actor(agent).inviteManager(
    propertyId,
    { [role]: null },
    displayName,
    spendLimitCents == null ? [] : [BigInt(spendLimitCents)],
  ));
  return { token: raw.token, role: tag<ManagerRole>(raw.role), displayName: raw.displayName, expiresAt: nsToMs(raw.expiresAt) };
}

export async function updateManager(
  propertyId: string,
  managerPrincipal: string,
  role: ManagerRole,
  spendLimitCents: number | null,
  agent?: HttpAgent,
): Promise<void> {
  unwrap(await actor(agent).updateManagerRole(
    propertyId,
    Principal.fromText(managerPrincipal),
    { [role]: null },
    spendLimitCents == null ? [] : [BigInt(spendLimitCents)],
  ));
}

export async function removeManager(propertyId: string, managerPrincipal: string, agent?: HttpAgent): Promise<void> {
  unwrap(await actor(agent).removeManager(propertyId, Principal.fromText(managerPrincipal)));
}

/** Activity managers performed on the owner's behalf, newest first. */
export async function getOwnerNotifications(propertyId: string, agent?: HttpAgent): Promise<OwnerNotification[]> {
  const raw: any[] = unwrap(await actor(agent).getOwnerNotifications(propertyId));
  return raw.map((n) => ({
    id:          Number(n.id),
    managerName: n.managerName,
    description: n.description,
    timestamp:   nsToMs(n.timestamp),
    seen:        n.seen,
  }));
}

/** Marks every activity notification on the property as seen. */
export async function dismissNotifications(propertyId: string, agent?: HttpAgent): Promise<void> {
  unwrap(await actor(agent).dismissNotifications(propertyId));
}

export async function getApprovals(propertyId: string, agent?: HttpAgent): Promise<ApprovalRequest[]> {
  const raw: any[] = unwrap(await actor(agent).getApprovals(propertyId));
  return raw.map((a) => ({
    id:            Number(a.id),
    requesterName: a.requesterName,
    description:   a.description,
    amountCents:   Number(a.amountCents),
    createdAt:     nsToMs(a.createdAt),
    status:        tag<ApprovalStatus>(a.status),
  }));
}

export async function respondToApproval(propertyId: string, approvalId: number, approve: boolean, agent?: HttpAgent): Promise<void> {
  unwrap(await actor(agent).respondToApproval(propertyId, BigInt(approvalId), approve));
}

// ── Display helpers (pure) ────────────────────────────────────────────────────

export function verificationChip(level: VerificationLevel): string {
  switch (level) {
    case "Premium":       return "PREMIUM VERIFIED";
    case "Basic":         return "VERIFIED";
    case "PendingReview": return "IN REVIEW";
    default:              return "UNVERIFIED";
  }
}

export function verificationDocChip(method: string | null): string | null {
  switch (method) {
    case "DeedRecord":  return "DEED ON FILE";
    case "TaxRecord":   return "TAX RECORD ON FILE";
    case "UtilityBill": return "UTILITY BILL ON FILE";
    default:            return null;
  }
}

/** "SINGLE FAMILY" from "SingleFamily". */
export function propertyTypeLabel(t: string): string {
  return t.replace(/([a-z])([A-Z])/g, "$1 $2").toUpperCase();
}

/** "No limit" or "$500". */
export function spendLimitLabel(cents: number | null): string {
  return cents == null ? "No limit" : "$" + Math.round(cents / 100).toLocaleString("en-US");
}

/** "MD" from "Marcus Dean"; "DA" is never produced — one word gives one letter. */
export function initials(name: string): string {
  const parts = name.replace(/@.*$/, "").split(/[\s.\-_]+/).filter((p) => /[A-Za-z]/.test(p));
  return parts.slice(0, 2).map((p) => p.replace(/[^A-Za-z]/g, "")[0].toUpperCase()).join("") || "?";
}

/** Street addresses for property ids (contractor views show jobs on other people's homes). */
export async function getStreetAddresses(ids: string[], agent?: HttpAgent): Promise<Record<string, string>> {
  const unique = [...new Set(ids)];
  const a = actor(agent);
  const results = await Promise.all(unique.map((id) => a.getProperty(id).catch(() => null)));
  const out: Record<string, string> = {};
  results.forEach((r: any, i) => { if (r && "ok" in r) out[unique[i]] = r.ok.address; });
  return out;
}
