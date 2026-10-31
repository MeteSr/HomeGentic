// Generated from ../declarations/recurring.ts by scripts/gen-declaration-types.mjs. Do not edit;
// change the declaration and run `npm run gen:declaration-types`.
import type { ActorMethod } from "@icp-sdk/core/agent";
import type { Principal } from "@icp-sdk/core/principal";

export type VisitLog = {
  id: string;
  note: [] | [string];
  createdAt: bigint;
  visitDate: string;
  propertyId: string;
  serviceId: string;
};

export type Error =
  { InvalidInput: string } | { NotFound: null } | { NotAuthorized: null } | { AlreadyCancelled: null };

export type RecurringService = {
  id: string;
  status: ServiceStatus;
  serviceType: RecurringServiceType;
  createdAt: bigint;
  propertyId: string;
  contractDocPhotoId: [] | [string];
  contractEndDate: [] | [string];
  providerPhone: [] | [string];
  notes: [] | [string];
  providerLicense: [] | [string];
  providerName: string;
  frequency: Frequency;
  homeowner: Principal;
  startDate: string;
};

export type ServiceStatus = { Paused: null } | { Active: null } | { Cancelled: null };

export type RecurringServiceType =
  | { PoolMaintenance: null }
  | { PestControl: null }
  | { Other: null }
  | { LawnCare: null }
  | { GutterCleaning: null }
  | { PressureWashing: null };

export type Frequency =
  | { BiWeekly: null }
  | { Weekly: null }
  | { Quarterly: null }
  | { Monthly: null }
  | { SemiAnnually: null }
  | { Annually: null };

/** The methods this declaration lists, for `lazyActor<_SERVICE>(idlFactory, canisterId)`. */
export interface _SERVICE {
  addVisitLog: ActorMethod<[string, string, [] | [string]], { ok: VisitLog } | { err: Error }>;
  attachContractDoc: ActorMethod<[string, string], { ok: RecurringService } | { err: Error }>;
  createRecurringService: ActorMethod<
    [
      string,
      RecurringServiceType,
      string,
      [] | [string],
      [] | [string],
      Frequency,
      string,
      [] | [string],
      [] | [string],
    ],
    { ok: RecurringService } | { err: Error }
  >;
  deleteMyData: ActorMethod<[], { ok: bigint } | { err: Error }>;
  getByProperty: ActorMethod<[string], RecurringService[]>;
  getMetrics: ActorMethod<
    [],
    {
      totalServices: bigint;
      totalVisitLogs: bigint;
      isPaused: boolean;
      pausedServices: bigint;
      activeServices: bigint;
    }
  >;
  getRecurringService: ActorMethod<[string], { ok: RecurringService } | { err: Error }>;
  getScheduleForProperties: ActorMethod<
    [string[]],
    {
      services: RecurringService[];
      visits: VisitLog[];
    }
  >;
  getVisitLogs: ActorMethod<[string], VisitLog[]>;
  updateStatus: ActorMethod<[string, ServiceStatus], { ok: RecurringService } | { err: Error }>;
}
