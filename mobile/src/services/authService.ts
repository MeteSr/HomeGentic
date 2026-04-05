import { Actor, HttpAgent } from "@dfinity/agent";
import { fromProfile, UserProfile } from "./authTypes";

export type { UserRole, UserProfile } from "./authTypes";
export { fromProfile } from "./authTypes";

const AUTH_CANISTER_ID = process.env.EXPO_PUBLIC_AUTH_CANISTER_ID ?? "";

const idlFactory = ({ IDL }: any) => {
  const UserRole = IDL.Variant({
    Homeowner:  IDL.Null,
    Contractor: IDL.Null,
    Realtor:    IDL.Null,
  });
  const UserProfileIDL = IDL.Record({
    principal:    IDL.Principal,
    role:         UserRole,
    email:        IDL.Text,
    phone:        IDL.Text,
    createdAt:    IDL.Int,
    updatedAt:    IDL.Int,
    isActive:     IDL.Bool,
    lastLoggedIn: IDL.Opt(IDL.Int),
  });
  const Error = IDL.Variant({
    NotFound:      IDL.Null,
    AlreadyExists: IDL.Null,
    NotAuthorized: IDL.Null,
    Paused:        IDL.Null,
    InvalidInput:  IDL.Text,
  });
  const Result = IDL.Variant({ ok: UserProfileIDL, err: Error });
  return IDL.Service({
    getProfile: IDL.Func([], [Result], ["query"]),
  });
};

function unwrap(result: any): UserProfile {
  if ("ok" in result) return fromProfile(result.ok);
  const key = Object.keys(result.err)[0];
  const val  = result.err[key];
  throw new Error(typeof val === "string" ? val : key);
}

/**
 * Fetch the authenticated user's profile from the auth canister.
 * Takes the already-built HttpAgent (from useAuth) rather than
 * constructing its own, so the caller's identity is used.
 *
 * Returns null when no canister ID is configured (dev/test mode).
 */
export async function getProfile(agent: HttpAgent): Promise<UserProfile | null> {
  if (!AUTH_CANISTER_ID) return null;
  const actor = Actor.createActor(idlFactory, {
    agent,
    canisterId: AUTH_CANISTER_ID,
  });
  const result = await (actor as any).getProfile();
  return unwrap(result);
}
