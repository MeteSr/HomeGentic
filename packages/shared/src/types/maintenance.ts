// Generated from ../declarations/maintenance.ts by scripts/gen-declaration-types.mjs. Do not edit;
// change the declaration and run `npm run gen:declaration-types`.
import type { ActorMethod } from "@icp-sdk/core/agent";
import type { Principal } from "@icp-sdk/core/principal";

export type ScheduleEntry = {
  id: string;
  plannedYear: bigint;
  isCompleted: boolean;
  plannedMonth: [] | [bigint];
  createdAt: bigint;
  createdBy: Principal;
  taskDescription: string;
  propertyId: string;
  estimatedCostCents: [] | [bigint];
  systemName: string;
};

export type Error = { InvalidInput: string } | { NotFound: null } | { NotAuthorized: null };

/** The methods this declaration lists, for `lazyActor<_SERVICE>(idlFactory, canisterId)`. */
export interface _SERVICE {
  createScheduleEntry: ActorMethod<
    [string, string, string, bigint, [] | [bigint], [] | [bigint]],
    { ok: ScheduleEntry } | { err: Error }
  >;
  deleteMyData: ActorMethod<[], { ok: bigint } | { err: Error }>;
  getScheduleByProperty: ActorMethod<[string], ScheduleEntry[]>;
  markCompleted: ActorMethod<[string], { ok: ScheduleEntry } | { err: Error }>;
}
