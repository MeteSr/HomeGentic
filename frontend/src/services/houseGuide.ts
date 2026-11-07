/**
 * #725: the house guide a household writes for sitters, guests and cleaners
 * (property canister: setHouseGuide / getHouseGuide), and the expiring,
 * revocable links that show it to anyone who has them (createHouseGuideLink,
 * listHouseGuideLinks, revokeHouseGuideLink, getSharedHouseGuide). Text is
 * stored exactly as typed, Wi-Fi passwords and alarm codes included. Photos
 * the guide lists load through the photo canister (getGuidePhotoData) or, when
 * stored off-chain, the voice Worker (/photos/<id>?guide=<token>).
 */
import { lazyActor } from "./lazyActor";
import { idlFactory } from "@homegentic/shared/declarations/property";
import { idlFactory as photoIdl } from "@homegentic/shared/declarations/photo";
import type { _SERVICE as PropertyCanister } from "@homegentic/shared/types/property";
import type { _SERVICE as PhotoCanister } from "@homegentic/shared/types/photo";
import type * as PropertyTypes from "@homegentic/shared/types/property";
import { canisterError } from "./candid";

const PROPERTY_CANISTER_ID = (process.env as any).PROPERTY_CANISTER_ID || "";
const PHOTO_CANISTER_ID = (process.env as any).PHOTO_CANISTER_ID || "";
const VOICE_AGENT_URL = (import.meta as any).env?.VITE_VOICE_AGENT_URL || "http://localhost:8787";
const getActor = lazyActor<PropertyCanister>(idlFactory, PROPERTY_CANISTER_ID);
const getPhotoActor = lazyActor<PhotoCanister>(photoIdl, PHOTO_CANISTER_ID);

export interface GuideContact {
  name: string;
  role: string;
  phone: string;
}

export interface HouseGuide {
  wifiName: string;
  wifiPassword: string;
  alarm: string;
  trashDay: string;
  recyclingDay: string;
  waterShutoff: string;
  gasShutoff: string;
  electricPanel: string;
  contacts: GuideContact[];
  notes: string;
  /** Photos of this home shown with the guide (shutoffs, panel). */
  photoIds: string[];
  /** When it was last saved (ms); absent before the first save. */
  updatedAt?: number;
}

export interface GuideLink {
  token: string;
  name: string;
  createdAt: number;
  expiresAt: number;
  revoked: boolean;
}

/** What a link shows: the guide and the home's address, nothing else. */
export interface SharedGuide {
  address: string;
  city: string;
  state: string;
  zipCode: string;
  guide: HouseGuide;
  expiresAt: number;
}

export const EMPTY_GUIDE: HouseGuide = {
  wifiName: "",
  wifiPassword: "",
  alarm: "",
  trashDay: "",
  recyclingDay: "",
  waterShutoff: "",
  gasShutoff: "",
  electricPanel: "",
  contacts: [],
  notes: "",
  photoIds: [],
};

/** How long a new link can last, in days (the canister allows 1 to 90). */
export const LINK_DAY_OPTIONS = [1, 3, 7, 14, 30, 90] as const;
export const MAX_GUIDE_CONTACTS = 10;
export const MAX_GUIDE_PHOTOS = 6;
const DAY_MS = 86_400_000;

const nsToMs = (ns: bigint) => Math.floor(Number(ns) / 1_000_000);

function fromCanister(raw: PropertyTypes.HouseGuideRecord): HouseGuide {
  return {
    wifiName: raw.wifiName,
    wifiPassword: raw.wifiPassword,
    alarm: raw.alarm,
    trashDay: raw.trashDay,
    recyclingDay: raw.recyclingDay,
    waterShutoff: raw.waterShutoff,
    gasShutoff: raw.gasShutoff,
    electricPanel: raw.electricPanel,
    contacts: raw.contacts.map((c) => ({ name: c.name, role: c.role, phone: c.phone })),
    notes: raw.notes,
    photoIds: [...raw.photoIds],
    updatedAt: nsToMs(raw.updatedAt),
  };
}

function toCanister(g: HouseGuide): PropertyTypes.HouseGuideInput {
  return {
    wifiName: g.wifiName,
    wifiPassword: g.wifiPassword,
    alarm: g.alarm,
    trashDay: g.trashDay,
    recyclingDay: g.recyclingDay,
    waterShutoff: g.waterShutoff,
    gasShutoff: g.gasShutoff,
    electricPanel: g.electricPanel,
    contacts: g.contacts.map((c) => ({ name: c.name, role: c.role, phone: c.phone })),
    notes: g.notes,
    photoIds: g.photoIds,
  };
}

function linkFromCanister(raw: PropertyTypes.HouseGuideLink): GuideLink {
  return {
    token: raw.token,
    name: raw.name,
    createdAt: nsToMs(raw.createdAt),
    expiresAt: nsToMs(raw.expiresAt),
    revoked: raw.revoked,
  };
}

// ─── E2E stand-ins ──────────────────────────────────────────────────────────
// window.__e2e_house_guides = { [propertyId]: HouseGuide }
// window.__e2e_guide_links  = [{ ...GuideLink, propertyId }]

type E2ELink = GuideLink & { propertyId: string };
function e2eGuides(): Record<string, HouseGuide> | undefined {
  return typeof window !== "undefined" ? (window as any).__e2e_house_guides : undefined;
}
function e2eLinks(): E2ELink[] {
  const w = window as any;
  w.__e2e_guide_links ??= [];
  return w.__e2e_guide_links;
}
function randomToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("");
}
const stripPropertyId = ({ propertyId: _p, ...l }: E2ELink): GuideLink => l;

export const houseGuideService = {
  async get(propertyId: string): Promise<HouseGuide | null> {
    const e2e = e2eGuides();
    if (e2e) return e2e[propertyId] ?? null;
    const res = await (await getActor()).getHouseGuide(propertyId);
    if ("err" in res) throw canisterError(res.err);
    return res.ok.length ? fromCanister(res.ok[0]) : null;
  },

  /** Save the guide, or clear it (and end its links) with null. */
  async save(propertyId: string, guide: HouseGuide | null): Promise<void> {
    const e2e = e2eGuides();
    if (e2e) {
      if (guide) e2e[propertyId] = guide;
      else {
        delete e2e[propertyId];
        for (const l of e2eLinks()) if (l.propertyId === propertyId) l.revoked = true;
      }
      return;
    }
    const res = await (await getActor()).setHouseGuide(propertyId, guide ? [toCanister(guide)] : []);
    if ("err" in res) throw canisterError(res.err);
  },

  async createLink(propertyId: string, name: string, days: number): Promise<GuideLink> {
    if (e2eGuides()) {
      const now = Date.now();
      const link: E2ELink = {
        token: randomToken(),
        propertyId,
        name: name.trim(),
        createdAt: now,
        expiresAt: now + days * DAY_MS,
        revoked: false,
      };
      e2eLinks().unshift(link);
      return stripPropertyId(link);
    }
    const res = await (await getActor()).createHouseGuideLink(propertyId, name, BigInt(days));
    if ("err" in res) throw canisterError(res.err);
    return linkFromCanister(res.ok);
  },

  /** The home's links, newest first, live or not. */
  async listLinks(propertyId: string): Promise<GuideLink[]> {
    if (e2eGuides())
      return e2eLinks()
        .filter((l) => l.propertyId === propertyId)
        .map(stripPropertyId);
    const res = await (await getActor()).listHouseGuideLinks(propertyId);
    if ("err" in res) throw canisterError(res.err);
    return res.ok.map(linkFromCanister);
  },

  async revokeLink(token: string): Promise<void> {
    if (e2eGuides()) {
      const l = e2eLinks().find((x) => x.token === token);
      if (l) l.revoked = true;
      return;
    }
    const res = await (await getActor()).revokeHouseGuideLink(token);
    if ("err" in res) throw canisterError(res.err);
  },

  /** What a link shows, or null when it is unknown, revoked or expired. */
  async getShared(token: string): Promise<SharedGuide | null> {
    const e2e = e2eGuides();
    if (e2e) {
      const l = e2eLinks().find((x) => x.token === token);
      const guide = l ? e2e[l.propertyId] : undefined;
      if (!l || !guide || linkState(l, Date.now()) !== "live") return null;
      const home = ((window as any).__e2e_properties ?? []).find((p: any) => String(p.id) === l.propertyId) ?? {};
      return {
        address: home.address ?? "",
        city: home.city ?? "",
        state: home.state ?? "",
        zipCode: home.zipCode ?? "",
        guide,
        expiresAt: l.expiresAt,
      };
    }
    const res = await (await getActor()).getSharedHouseGuide(token);
    if ("err" in res) {
      if ("NotFound" in res.err) return null;
      throw canisterError(res.err);
    }
    const s = res.ok;
    return {
      address: s.address,
      city: s.city,
      state: s.state,
      zipCode: s.zipCode,
      guide: fromCanister(s.guide),
      expiresAt: nsToMs(s.expiresAt),
    };
  },

  /** An image URL for a photo the shared guide shows; "" when it can't be loaded. */
  async sharedPhotoUrl(token: string, photoId: string): Promise<string> {
    try {
      const res = await (await getPhotoActor()).getGuidePhotoData(token, photoId);
      if ("err" in res) return "";
      if (res.ok.length > 0) return URL.createObjectURL(new Blob([new Uint8Array(res.ok)]));
      return `${VOICE_AGENT_URL}/photos/${encodeURIComponent(photoId)}?guide=${token}`;
    } catch {
      return "";
    }
  },
};

export function linkState(link: GuideLink, nowMs: number): "live" | "expired" | "revoked" {
  if (link.revoked) return "revoked";
  return nowMs < link.expiresAt ? "live" : "expired";
}

export function guideLinkUrl(token: string, origin: string): string {
  return `${origin}/guide/${token}`;
}

export function isGuideEmpty(g: HouseGuide): boolean {
  const text = [
    g.wifiName,
    g.wifiPassword,
    g.alarm,
    g.trashDay,
    g.recyclingDay,
    g.waterShutoff,
    g.gasShutoff,
    g.electricPanel,
    g.notes,
  ];
  return text.every((t) => t.trim() === "") && g.contacts.length === 0 && g.photoIds.length === 0;
}

/** The canister's rules, checked before saving. Returns the problem, or null. */
export function validateGuide(g: HouseGuide): string | null {
  const limits: [string, number, string][] = [
    [g.wifiName, 100, "Wi-Fi name is over 100 characters"],
    [g.wifiPassword, 100, "Wi-Fi password is over 100 characters"],
    [g.alarm, 500, "Alarm notes are over 500 characters"],
    [g.trashDay, 200, "Trash day is over 200 characters"],
    [g.recyclingDay, 200, "Recycling day is over 200 characters"],
    [g.waterShutoff, 500, "Water shutoff notes are over 500 characters"],
    [g.gasShutoff, 500, "Gas shutoff notes are over 500 characters"],
    [g.electricPanel, 500, "Electrical panel notes are over 500 characters"],
    [g.notes, 4000, "Notes are over 4,000 characters"],
  ];
  for (const [text, max, why] of limits) if (text.trim().length > max) return why;
  if (g.contacts.length > MAX_GUIDE_CONTACTS) return "A guide can list up to 10 contacts";
  for (const c of g.contacts) {
    if (c.name.trim() === "") return "Give each contact a name";
    if (c.name.trim().length > 100) return "Contact name is over 100 characters";
    if (c.role.trim().length > 100) return "Contact role is over 100 characters";
    if (c.phone.trim().length > 40) return "Contact phone is over 40 characters";
  }
  if (g.photoIds.length > MAX_GUIDE_PHOTOS) return "A guide can show up to 6 photos";
  if (isGuideEmpty(g)) return "Fill in at least one part of the guide";
  return null;
}

/** What each onboarding (baseline) photo shows, by the key it was saved with. */
const BASELINE_LABELS: Record<string, string> = {
  shutoff: "Main water shut-off valve",
  electrical: "Electrical panel",
  waterHeater: "Water heater",
  hvac: "HVAC / air conditioning",
  roof: "Roof",
  garageDoor: "Garage door opener",
};

/** Onboarding photos are saved under the job id "baseline_<propertyId>". */
export function isBaselinePhoto(photo: { jobId: string; propertyId: string }): boolean {
  return photo.jobId === `baseline_${photo.propertyId}`;
}

export function baselinePhotoLabel(description: string): string {
  return BASELINE_LABELS[description] ?? (description || "Photo");
}
