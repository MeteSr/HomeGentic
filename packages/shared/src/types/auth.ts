// Generated from ../declarations/auth.ts by scripts/gen-declaration-types.mjs. Do not edit;
// change the declaration and run `npm run gen:declaration-types`.
import type { ActorMethod } from "@icp-sdk/core/agent";
import type { Principal } from "@icp-sdk/core/principal";

export type Error =
  { Paused: null } | { InvalidInput: string } | { NotFound: null } | { NotAuthorized: null } | { AlreadyExists: null };

export type Result = { ok: UserProfile } | { err: Error };

export type UserProfile = {
  principal: Principal;
  createdAt: bigint;
  lastLoggedIn: [] | [bigint];
  role: UserRole;
  onboardingComplete: [] | [boolean];
  isActive: boolean;
  email: string;
  updatedAt: bigint;
  phone: string;
};

export type UserRole = { Builder: null } | { Homeowner: null } | { Realtor: null } | { Contractor: null };

export type UserStats = {
  total: bigint;
  realtors: bigint;
  newToday: bigint;
  builders: bigint;
  activeThisWeek: bigint;
  contractors: bigint;
  newThisWeek: bigint;
  homeowners: bigint;
};

export type RegisterArgs = {
  role: UserRole;
  email: string;
  phone: string;
};

export type UpdateArgs = {
  email: string;
  phone: string;
};

/** The methods this declaration lists, for `lazyActor<_SERVICE>(idlFactory, canisterId)`. */
export interface _SERVICE {
  completeOnboarding: ActorMethod<[], undefined>;
  deleteMyData: ActorMethod<[], { ok: bigint } | { err: Error }>;
  getMetrics: ActorMethod<
    [],
    {
      realtors: bigint;
      isPaused: boolean;
      builders: bigint;
      contractors: bigint;
      homeowners: bigint;
      totalUsers: bigint;
    }
  >;
  getNotificationContact: ActorMethod<
    [Principal],
    | {
        ok:
          | []
          | [
              {
                email: string;
              },
            ];
      }
    | { err: Error }
  >;
  getProfile: ActorMethod<[], Result>;
  getPulseRecipients: ActorMethod<
    [[] | [Principal], bigint],
    | {
        ok: Array<{
          principal: Principal;
          email: string;
        }>;
      }
    | { err: Error }
  >;
  getUserStats: ActorMethod<[], UserStats>;
  hasRole: ActorMethod<[UserRole], boolean>;
  isAdminPrincipal: ActorMethod<[Principal], boolean>;
  issueAgentSession: ActorMethod<
    [],
    | {
        ok: {
          token: string;
          expiresAt: bigint;
        };
      }
    | { err: Error }
  >;
  recordLogin: ActorMethod<[], undefined>;
  register: ActorMethod<[RegisterArgs], Result>;
  resolveAgentSession: ActorMethod<[string], [] | [Principal]>;
  revokeAgentSession: ActorMethod<[], undefined>;
  updateProfile: ActorMethod<[UpdateArgs], Result>;
}
