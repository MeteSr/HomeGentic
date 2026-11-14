/**
 * query_home_records: the in-app assistant's one generic read tool
 * (audits/icp-aiware-2026-11-10.md). It reads through OQL `schema()` and
 * `execute(oql)` on the job, bills, property, maintenance, recurring and
 * sensor canisters, so records added
 * to those catalogues reach the assistant without a hand-written tool each.
 *
 * It runs in the browser under the signed-in user's own identity, like every
 * agent tool, so the canisters' access checks decide which homes and rows come
 * back. The shaping and limits live in @homegentic/shared/homeRecords (the
 * mobile app uses the same); this module supplies the web app's actors:
 *  - the listed sources only; anything else never reaches a canister
 *  - at most MAX_ROWS rows a call, and at most MAX_RESULT_CHARS of JSON
 *  - every result carries a note that its text is data, not instructions
 *    (rows hold text other people wrote: contractor names, notes, adjusters)
 * Each round trip also counts as one agent call on the Worker, so the existing
 * agent allowance (10 a day Pro, 10 a week Free) is the cost cap.
 */
import { lazyActor } from "./lazyActor";
import { idlFactory as jobIdl } from "@homegentic/shared/declarations/job";
import { idlFactory as billsIdl } from "@homegentic/shared/declarations/bills";
import { idlFactory as propertyIdl } from "@homegentic/shared/declarations/property";
import type { _SERVICE as JobCanister } from "@homegentic/shared/types/job";
import type { _SERVICE as BillsCanister } from "@homegentic/shared/types/bills";
import type { _SERVICE as PropertyCanister } from "@homegentic/shared/types/property";
import { idlFactory as maintenanceIdl } from "@homegentic/shared/declarations/maintenance";
import { idlFactory as recurringIdl } from "@homegentic/shared/declarations/recurring";
import { idlFactory as sensorIdl } from "@homegentic/shared/declarations/sensor";
import type { _SERVICE as MaintenanceCanister } from "@homegentic/shared/types/maintenance";
import type { _SERVICE as RecurringCanister } from "@homegentic/shared/types/recurring";
import type { _SERVICE as SensorCanister } from "@homegentic/shared/types/sensor";

import {
  queryHomeRecords as runQuery,
  type HomeRecordSource,
  type HomeRecordsInput,
  type HomeRecordsResult,
  type OqlActor,
} from "@homegentic/shared/homeRecords";

export { HOME_RECORD_SOURCES, MAX_ROWS, MAX_RESULT_CHARS } from "@homegentic/shared/homeRecords";

// Written out in full so vite's `define` replaces them (vite.config.ts).
const JOB_CANISTER_ID = (process.env as any).JOB_CANISTER_ID || "";
const BILLS_CANISTER_ID = (process.env as any).BILLS_CANISTER_ID || "";
const PROPERTY_CANISTER_ID = (process.env as any).PROPERTY_CANISTER_ID || "";
const MAINTENANCE_CANISTER_ID = (process.env as any).MAINTENANCE_CANISTER_ID || "";
const RECURRING_CANISTER_ID = (process.env as any).RECURRING_CANISTER_ID || "";
const SENSOR_CANISTER_ID = (process.env as any).SENSOR_CANISTER_ID || "";
const actors: Record<HomeRecordSource, () => Promise<OqlActor>> = {
  job: lazyActor<JobCanister>(jobIdl, JOB_CANISTER_ID),
  bills: lazyActor<BillsCanister>(billsIdl, BILLS_CANISTER_ID),
  property: lazyActor<PropertyCanister>(propertyIdl, PROPERTY_CANISTER_ID),
  maintenance: lazyActor<MaintenanceCanister>(maintenanceIdl, MAINTENANCE_CANISTER_ID),
  recurring: lazyActor<RecurringCanister>(recurringIdl, RECURRING_CANISTER_ID),
  sensor: lazyActor<SensorCanister>(sensorIdl, SENSOR_CANISTER_ID),
};

export function queryHomeRecords(input: HomeRecordsInput): Promise<HomeRecordsResult> {
  return runQuery(input, (source) => actors[source]());
}
