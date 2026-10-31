// Generated from ../declarations/ai_proxy.ts by scripts/gen-declaration-types.mjs. Do not edit;
// change the declaration and run `npm run gen:declaration-types`.
import type { ActorMethod } from "@icp-sdk/core/agent";
import type { Principal } from "@icp-sdk/core/principal";

export type ResultOkError = { ok: null } | { err: Error };

export type Error =
  | { Paused: null }
  | { InvalidInput: string }
  | { NotFound: null }
  | { NotAuthorized: null }
  | { RateLimited: null }
  | { KeyNotConfigured: null }
  | { HttpError: string };

export type KeyStatus = {
  resendKeySet: boolean;
  attomKeySet: boolean;
  openPermitKeySet: boolean;
};

export type Metrics = {
  emailSentTotal: bigint;
  isPaused: boolean;
  adminCount: bigint;
  permitsFetched: bigint;
};

export type ResultTextText = { ok: string } | { err: string };

export type ResultTextError = { ok: string } | { err: Error };

/** The methods this declaration lists, for `lazyActor<_SERVICE>(idlFactory, canisterId)`. */
export interface _SERVICE {
  addAdmin: ActorMethod<[Principal, string], ResultOkError>;
  addTrustedCanister: ActorMethod<[Principal], ResultOkError>;
  checkReport: ActorMethod<[string], string>;
  emailUsage: ActorMethod<[], string>;
  getKeyStatus: ActorMethod<[], KeyStatus>;
  getMetrics: ActorMethod<[], Metrics>;
  getPriceBenchmark: ActorMethod<[string, string], ResultTextText>;
  getTrustedCanisters: ActorMethod<[], Principal[]>;
  health: ActorMethod<[], string>;
  importPermits: ActorMethod<[string, string, string, string], ResultTextError>;
  instantForecast: ActorMethod<[string, bigint, [] | [string], string], ResultTextText>;
  lookupPropertyDetails: ActorMethod<[string, string, string, string], ResultTextError>;
  lookupYearBuilt: ActorMethod<[string], string>;
  pause: ActorMethod<[[] | [bigint]], ResultOkError>;
  removeTrustedCanister: ActorMethod<[Principal], ResultOkError>;
  requestReport: ActorMethod<[string, string], ResultOkError>;
  sendEmail: ActorMethod<[string, string, string, [] | [string], [] | [string], [] | [string]], ResultTextError>;
  sendInviteEmail: ActorMethod<[string, [] | [string], string, string, [] | [bigint], string], ResultTextError>;
  sendJobMatchEmail: ActorMethod<[string, string, string, string], ResultTextError>;
  setAttomApiKey: ActorMethod<[string], ResultOkError>;
  setBootstrapNonce: ActorMethod<[string], undefined>;
  setOpenPermitApiKey: ActorMethod<[string], ResultOkError>;
  setResendApiKey: ActorMethod<[string], ResultOkError>;
  setResendFromAddress: ActorMethod<[string], ResultOkError>;
  setUpdateRateLimit: ActorMethod<[bigint], ResultOkError>;
  unpause: ActorMethod<[], ResultOkError>;
}
