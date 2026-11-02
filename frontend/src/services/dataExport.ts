/**
 * Settings → Privacy → Download My Data: everything the app holds for the
 * signed-in user, as a ZIP of data.json plus their photo files. It covers the
 * same canisters account deletion does (services/accountDeletion.ts), plus the
 * records deletion keeps (subscription), so "export your data" in the Privacy
 * Policy is true. Keep the two lists in step.
 *
 * Each section is read on its own; one that fails is recorded with its error
 * instead of failing the whole export, and the UI says which ones failed.
 */
import { authService } from "./auth";
import { paymentService } from "./payment";
import { propertyService } from "./property";
import { jobService } from "./job";
import { photoService, type Photo } from "./photo";
import { roomService } from "./room";
import { maintenanceService } from "./maintenance";
import { sensorService } from "./sensor";
import { billService } from "./billService";
import { recurringService } from "./recurringService";
import { reportService } from "./report";
import { quoteService } from "./quote";
import { listingService } from "./listing";
import { contractorService } from "./contractor";
import { agentService } from "./agent";
import { getNotificationPrefs, notificationsConfigured } from "./notificationPrefs";
import { createZip, type ZipEntry } from "@/utils/zip";

type Section<T> = { ok: T } | { error: string };

export interface DataExport {
  exportedAt: string;
  format: "homegentic-export/1";
  account: Record<string, Section<unknown>>;
  properties: Section<
    Array<{
      property: unknown;
      sections: Record<string, Section<unknown>>;
    }>
  >;
  failed: string[];
}

async function section<T>(failed: string[], name: string, read: () => Promise<T>): Promise<Section<T>> {
  try {
    return { ok: await read() };
  } catch (err) {
    failed.push(name);
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

/** JSON can't hold BigInt, Principal or bytes; photo bytes go in their own files. */
function jsonReplacer(_key: string, value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (value && typeof value === "object" && typeof (value as { toText?: unknown }).toText === "function") {
    return (value as { toText: () => string }).toText();
  }
  if (value instanceof Uint8Array) return `(${value.length} bytes)`;
  return value;
}

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "application/pdf": "pdf",
};

/** Reads everything. `onProgress` gets a short label for each step. */
export async function collectMyData(
  onProgress?: (step: string) => void,
): Promise<{ data: DataExport; photos: Photo[] }> {
  const failed: string[] = [];
  const step = <T>(name: string, read: () => Promise<T>) => {
    onProgress?.(name);
    return section(failed, name, read);
  };

  const account: Record<string, Section<unknown>> = {
    profile: await step("profile", () => authService.getProfile()),
    subscription: await step("subscription", () => paymentService.getMySubscription()),
    quoteRequests: await step("quote requests", () => quoteService.getRequests()),
    quotesSubmitted: await step("quotes you submitted", () => quoteService.getMyBids()),
    listingBidRequests: await step("listing requests", () => listingService.getMyBidRequests()),
    listingProposals: await step("listing proposals", () => listingService.getMyProposals()),
    contractorProfile: await step("contractor profile", () => contractorService.getMyProfile()),
    agentProfile: await step("agent profile", () => agentService.getMyProfile()),
  };
  if (notificationsConfigured()) {
    account.notificationSettings = await step("notification settings", () => getNotificationPrefs());
  }

  const photos: Photo[] = [];
  const properties = await step("properties", async () => {
    const mine = await propertyService.getMyProperties();
    const out = [];
    for (const p of mine) {
      const id = String(p.id);
      const at = (what: string) => `${what} (${p.address})`;
      const sections: Record<string, Section<unknown>> = {
        jobs: await step(at("jobs"), () => jobService.getByProperty(id)),
        rooms: await step(at("rooms"), () => roomService.getRoomsByProperty(id)),
        maintenanceSchedule: await step(at("maintenance schedule"), () => maintenanceService.getScheduleByProperty(id)),
        bills: await step(at("bills"), () => billService.getBillsForProperty(id)),
        recurringExpenses: await step(at("recurring expenses"), () => billService.getRecurringExpensesForProperty(id)),
        recurringServices: await step(at("recurring services"), () => recurringService.getByProperty(id)),
        smartHomeDevices: await step(at("smart-home devices"), () => sensorService.getDevicesForProperty(id)),
        smartHomeEvents: await step(at("smart-home events"), () => sensorService.getEventsForProperty(id, 1000)),
        reportShareLinks: await step(at("report links"), () => reportService.listShareLinks(id)),
        ownershipHistory: await step(at("ownership history"), () => propertyService.getOwnershipHistory(id)),
      };
      const ph = await step(at("photos"), () => photoService.getByProperty(id));
      if ("ok" in ph) {
        photos.push(...ph.ok);
        sections.photos = { ok: ph.ok.map(({ url: _url, ...meta }) => ({ ...meta, file: `photos/${id}/${meta.id}` })) };
      } else {
        sections.photos = ph;
      }
      out.push({ property: p, sections });
    }
    return out;
  });

  return {
    data: { exportedAt: new Date().toISOString(), format: "homegentic-export/1", account, properties, failed },
    photos,
  };
}

/** Builds the ZIP: data.json, README.txt and photos/<propertyId>/<photoId>.<ext>. */
export async function buildExportZip(
  onProgress?: (step: string) => void,
  fetchImpl: typeof fetch = fetch,
): Promise<{ zip: Uint8Array; failed: string[] }> {
  const { data, photos } = await collectMyData(onProgress);
  const entries: ZipEntry[] = [];
  const enc = new TextEncoder();
  const fileFor = new Map<string, string>();
  for (const ph of photos) {
    onProgress?.("photo files");
    try {
      if (!ph.url) throw new Error("no file");
      const res = await fetchImpl(ph.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const name = `photos/${ph.propertyId}/${ph.id}.${EXT[blob.type] ?? "bin"}`;
      entries.push({ name, data: new Uint8Array(await blob.arrayBuffer()), modified: new Date(ph.createdAt) });
      fileFor.set(ph.id, name);
    } catch {
      data.failed.push(`photo ${ph.id}`);
    }
  }
  // Point each photo's metadata at the file actually written.
  if ("ok" in data.properties) {
    for (const p of data.properties.ok) {
      const s = p.sections.photos;
      if (s && "ok" in s) {
        for (const m of s.ok as Array<{ id: string; file: string | null }>) m.file = fileFor.get(m.id) ?? null;
      }
    }
  }
  const readme =
    "Your HomeGentic data, exported " +
    data.exportedAt +
    ".\n\n" +
    "data.json holds your profile, subscription, homes and everything recorded on them\n" +
    "(jobs, rooms, schedule, bills, recurring services, smart-home devices and events,\n" +
    "report links, ownership history), your quote requests and quotes, listing requests\n" +
    "and proposals, contractor and agent profiles, and notification settings.\n" +
    "photos/ holds your photo files, one folder per home; each photo's entry in data.json\n" +
    "names its file.\n" +
    (data.failed.length ? "\nThese parts could not be read and are missing: " + data.failed.join(", ") + ".\n" : "");
  entries.unshift(
    { name: "data.json", data: enc.encode(JSON.stringify(data, jsonReplacer, 2)) },
    { name: "README.txt", data: enc.encode(readme) },
  );
  return { zip: createZip(entries), failed: data.failed };
}
