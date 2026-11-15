/**
 * The assistant's read-only lookups, run on the phone under the signed-in
 * identity so the canisters' own access checks decide what comes back. The
 * shaping and limits are the web app's (packages/shared).
 *
 * Only these run here. Every tool that changes something (logging a job,
 * accepting a bid, sharing a report) and the checks that need the website's
 * forecast are answered with "not available from the mobile app yet".
 */
import { queryHomeRecords, type HomeRecordSource, type OqlActor } from "@homegentic/shared/homeRecords";
import { listDocuments } from "@homegentic/shared/documentVault";
import { serviceTypeKey, serviceSubtypeKey } from "@homegentic/shared/serviceTypes";
import { nationalPriceRange } from "@homegentic/shared/nationalPrices";
import { idlFactory as jobIdl } from "@homegentic/shared/declarations/job";
import { idlFactory as billsIdl } from "@homegentic/shared/declarations/bills";
import { idlFactory as propertyIdl } from "@homegentic/shared/declarations/property";
import { idlFactory as maintenanceIdl } from "@homegentic/shared/declarations/maintenance";
import { idlFactory as recurringIdl } from "@homegentic/shared/declarations/recurring";
import { idlFactory as sensorIdl } from "@homegentic/shared/declarations/sensor";
import { idlFactory as photoIdl } from "@homegentic/shared/declarations/photo";
import type { _SERVICE as JobCanister } from "@homegentic/shared/types/job";
import type { _SERVICE as PhotoCanister } from "@homegentic/shared/types/photo";
import { actorFor, nsToMs } from "./canister";

export interface AssistantToolResult {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

/** The tools the mobile app runs; all read-only. */
export const MOBILE_ASSISTANT_TOOLS: ReadonlySet<string> = new Set([
  "query_home_records",
  "get_home_checkup",
  "get_price_benchmark",
]);

// Written out in full: Expo inlines EXPO_PUBLIC_* only when named literally.
const JOB_CANISTER_ID = process.env.EXPO_PUBLIC_JOB_CANISTER_ID ?? "";
const PHOTO_CANISTER_ID = process.env.EXPO_PUBLIC_PHOTO_CANISTER_ID ?? "";
const SOURCES: Record<HomeRecordSource, { idl: typeof jobIdl; id: string }> = {
  job: { idl: jobIdl, id: JOB_CANISTER_ID },
  bills: { idl: billsIdl, id: process.env.EXPO_PUBLIC_BILLS_CANISTER_ID ?? "" },
  property: { idl: propertyIdl, id: process.env.EXPO_PUBLIC_PROPERTY_CANISTER_ID ?? "" },
  maintenance: { idl: maintenanceIdl, id: process.env.EXPO_PUBLIC_MAINTENANCE_CANISTER_ID ?? "" },
  recurring: { idl: recurringIdl, id: process.env.EXPO_PUBLIC_RECURRING_CANISTER_ID ?? "" },
  sensor: { idl: sensorIdl, id: process.env.EXPO_PUBLIC_SENSOR_CANISTER_ID ?? "" },
};

const fail = (error: string): AssistantToolResult => ({ success: false, error });
const ON_WEBSITE = "That check isn't in the mobile app yet. Tell the user it's on homegentic.app.";
const dollars = (cents: number) => "$" + Math.round(cents / 100).toLocaleString("en-US");

async function documents(propertyId: string, docType: unknown): Promise<AssistantToolResult> {
  if (!PHOTO_CANISTER_ID || !propertyId) return fail("Couldn't read the home's documents just now. Try again shortly.");
  let metas;
  try {
    const photo = actorFor<PhotoCanister>(photoIdl, PHOTO_CANISTER_ID);
    const [legacy, current] = await Promise.all([
      photo.getPhotosByJob(`receipts_${propertyId}`),
      photo.getPhotosByJob(`docs_${propertyId}`),
    ]);
    metas = [...legacy, ...current];
  } catch {
    return fail("Couldn't read the home's documents just now. Try again shortly.");
  }
  const listed = listDocuments(
    metas.map((m) => ({ description: m.description, createdAtMs: nsToMs(m.createdAt) })),
    docType,
  );
  if ("error" in listed) return fail(listed.error);
  return { success: true, data: { check: "documents", ...listed } };
}

async function priceBenchmark(input: Record<string, unknown>): Promise<AssistantToolResult> {
  const serviceType = String(input.service_type ?? "");
  const zipCode = String(input.zip_code ?? "");
  const tag = serviceTypeKey(serviceType);
  const national = nationalPriceRange(serviceType);
  if (!national || !zipCode) return fail("service_type must be one of the app's service types, with a 5-digit zip_code.");
  // The typical U.S. range, when no verified local costs are available.
  const nationalResult: AssistantToolResult = {
    success: true,
    data: {
      found: true,
      serviceType,
      zipCode,
      source: "national",
      ...national,
      sampleSize: 0,
      summary: `Typical U.S. ${serviceType} cost: ${dollars(national.low)}–${dollars(national.high)} (median ${dollars(national.median)}). This is a national range, not local prices; say so if you quote it.`,
    },
  };
  // Subtypes travel as #Other, so there are no local costs for them on their own.
  if (!tag || serviceSubtypeKey(serviceType)) return nationalResult;
  if (!JOB_CANISTER_ID) return nationalResult;
  let s;
  try {
    s = (await actorFor<JobCanister>(jobIdl, JOB_CANISTER_ID).getVerifiedLocalCosts(tag, zipCode))[0];
  } catch {
    return fail("Couldn't look up local prices just now. Try again shortly.");
  }
  if (!s || Number(s.homes) < 5) return nationalResult;
  const [low, median, high, homes] = [Number(s.low), Number(s.median), Number(s.high), Number(s.homes)];
  return {
    success: true,
    data: {
      found: true,
      serviceType,
      zipCode,
      source: "local",
      low,
      median,
      high,
      sampleSize: homes,
      area: s.area,
      summary: `Typical ${serviceType} cost near ${s.area}: ${dollars(low)}–${dollars(high)} (median ${dollars(median)}) · From finished jobs at ${homes}+ homes in ${s.area} in the last 2 years, each signed off by the homeowner and a HomeGentic-verified contractor. Owners chose to share them; prices are rounded.`,
    },
  };
}

/** Runs a read-only lookup, or returns null for a tool the mobile app doesn't run. */
export async function runAssistantTool(
  name: string,
  input: Record<string, unknown>,
): Promise<AssistantToolResult | null> {
  if (!MOBILE_ASSISTANT_TOOLS.has(name)) return null;
  if (name === "query_home_records") {
    const source = SOURCES[input.source as HomeRecordSource];
    if (source && !source.id)
      return fail("Those records can't be read from this build of the app. Tell the user to try homegentic.app.");
    return queryHomeRecords(
      { source: input.source, entity: input.entity, query: input.query },
      (s) => actorFor<Pick<JobCanister, "schema" | "execute">>(SOURCES[s].idl, SOURCES[s].id) as OqlActor,
    );
  }
  if (name === "get_home_checkup") {
    return input.check === "documents" ? documents(String(input.property_id ?? ""), input.doc_type) : fail(ON_WEBSITE);
  }
  return priceBenchmark(input);
}
