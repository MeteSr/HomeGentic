/**
 * get_home_checkup: read-only answers the app already works out on its own
 * pages (document vault, Florida inspection readiness, reserve target, recall
 * check), handed to the in-app assistant for one home.
 *
 * It runs in the browser under the signed-in user's identity, like every
 * agent tool, and changes nothing. What reaches the model is limited:
 *  - documents: file names, kinds and dates only; never a file's contents or
 *    a link to it
 *  - every figure comes from the same pure function its page uses, with that
 *    page's caveat, so the assistant and the page can't disagree
 */
import { propertyService } from "./property";
import { jobService } from "./job";
import { photoService } from "./photo";
import { roomService } from "./room";
import { DOC_TYPES, listDocuments, type DocType } from "@homegentic/shared/documentVault";
import { fourPointReadiness, windMitigationReadiness, isFlorida, type ReadinessItem } from "./insuranceReadiness";
import { maintenanceReserve, RESERVE_NOTE, RESERVE_YEARS } from "./maintenanceReserve";
import { estimateSystems } from "./systemAgeEstimator";
import { systemAgesService } from "./systemAges";
import { recallItems, checkRecalls } from "./recalls";
import type { ToolCallResult } from "./agentTools";

export const HOME_CHECKS = ["documents", "inspection_readiness", "reserve", "recalls"] as const;
export type HomeCheck = (typeof HOME_CHECKS)[number];

const fail = (error: string): ToolCallResult => ({ success: false, error });

async function documents(propertyId: string, docType: unknown): Promise<ToolCallResult> {
  if (docType && !DOC_TYPES.includes(String(docType) as DocType))
    return fail(`doc_type must be one of: ${DOC_TYPES.join(", ")}`);
  let metas;
  try {
    const [legacy, current] = await Promise.all([
      photoService.listByJob(`receipts_${propertyId}`),
      photoService.listByJob(`docs_${propertyId}`),
    ]);
    metas = [...legacy, ...current];
  } catch {
    return fail("Couldn't read the home's documents just now. Try again shortly.");
  }
  const listed = listDocuments(
    metas.map((m) => ({ description: m.description, createdAtMs: m.createdAt })),
    docType,
  );
  if ("error" in listed) return fail(listed.error);
  return { success: true, data: { check: "documents", ...listed, path: `/properties/${propertyId}?tab=documents` } };
}

const readinessRow = (i: ReadinessItem) => ({
  item: i.label,
  status: i.status,
  inRecord: i.evidence,
  notInRecord: i.missing,
  ...(i.ageYears !== null ? { ageYears: i.ageYears } : {}),
  ...(i.ageNote ? { ageNote: i.ageNote } : {}),
});

export async function getHomeCheckup(input: Record<string, unknown>): Promise<ToolCallResult> {
  const check = String(input.check ?? "") as HomeCheck;
  if (!HOME_CHECKS.includes(check)) return fail(`Unknown check. Use one of: ${HOME_CHECKS.join(", ")}`);
  const propertyId = String(input.property_id ?? "");
  const property = (await propertyService.getMyProperties()).find((p) => String(p.id) === propertyId);
  if (!property) return fail("That home isn't one of the user's properties. Use an [ID: ...] from the property list.");
  const facts = { yearBuilt: Number(property.yearBuilt), state: property.state };

  if (check === "documents") return documents(propertyId, input.doc_type);

  if (check === "recalls") {
    let items;
    try {
      items = recallItems(await roomService.getRoomsByProperty(propertyId));
    } catch {
      return fail("Couldn't read the home's appliances just now. Try again shortly.");
    }
    if (items.length === 0)
      return {
        success: true,
        data: {
          check,
          appliancesChecked: 0,
          possibleRecalls: [],
          note: "No appliance on this home has both a brand and model recorded, so nothing could be checked. They are added under Rooms.",
          path: `/properties/${propertyId}?tab=rooms`,
        },
      };
    let matches;
    try {
      matches = await checkRecalls(items);
    } catch {
      return fail(
        "The recall check didn't answer just now, so it isn't known whether anything is recalled. Try again shortly.",
      );
    }
    return {
      success: true,
      data: {
        check,
        appliancesChecked: items.length,
        possibleRecalls: matches.flatMap((m) =>
          m.recalls.map((r) => ({
            brand: m.brand,
            model: m.model,
            title: r.title,
            date: r.date,
            hazard: r.hazard,
            remedy: r.remedy,
            url: r.url,
          })),
        ),
        note: "Checked against U.S. CPSC recall notices by brand and model. A match is a possible recall, not a confirmed one: the owner should compare the model on the CPSC notice.",
      },
    };
  }

  let jobs;
  try {
    jobs = await jobService.getByProperty(propertyId);
  } catch {
    return fail("Couldn't read the home's jobs just now. Try again shortly.");
  }
  const ages = systemAgesService.get(propertyId);

  if (check === "inspection_readiness") {
    if (!isFlorida(facts))
      return {
        success: true,
        data: {
          check,
          applies: false,
          note: "This checklist covers Florida's 4-point and wind mitigation inspections; this home isn't in Florida.",
        },
      };
    return {
      success: true,
      data: {
        check,
        applies: true,
        statuses:
          "documented = in the record; partial = partly; missing = not yet; onSite = only the inspector can establish it",
        fourPoint: fourPointReadiness(facts, jobs, ages).map(readinessRow),
        windMitigation: windMitigationReadiness(facts, jobs).map(readinessRow),
        note: "What a 4-point and a wind mitigation inspector will look at, next to what this home's record shows. It doesn't predict whether a carrier will insure the home or what it will charge.",
        path: "/insurance-defense",
      },
    };
  }

  const r = maintenanceReserve(estimateSystems(facts.yearBuilt, facts.state, ages), jobs);
  return {
    success: true,
    data: {
      check,
      years: RESERVE_YEARS,
      systemsDue: r.systemsDue,
      dueLowDollars: r.dueLow,
      dueHighDollars: r.dueHigh,
      monthlyLowDollars: r.monthlyLow,
      monthlyHighDollars: r.monthlyHigh,
      yearlyLowDollars: r.yearlyLow,
      yearlyHighDollars: r.yearlyHigh,
      spentThisYearDollars: Math.round(r.spentThisYearCents / 100),
      year: r.year,
      note: RESERVE_NOTE,
    },
  };
}
