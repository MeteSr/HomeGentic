import { Actor } from "@icp-sdk/core/agent";
import { getAgent } from "./actor";
import { idlFactory } from "@/declarations/auth";
export { idlFactory };

function getCanisterId() { return (process.env as any).AUTH_CANISTER_ID || ""; }

export type UserRole = "Homeowner" | "Contractor" | "Realtor" | "Builder";

export interface UserProfile {
  principal:          string;
  role:               UserRole;
  email:              string;
  phone:              string;
  createdAt:          bigint;
  updatedAt:          bigint;
  isActive:           boolean;
  lastLoggedIn:       number | null;  // ms timestamp of previous login; null on first login
  onboardingComplete: boolean;
}

export interface RegisterArgs {
  role: UserRole;
  email: string;
  phone: string;
}

let _actor: any = null;

async function getActor() {
  if (!_actor) {
    const ag = await getAgent();
    _actor = Actor.createActor(idlFactory, { agent: ag, canisterId: getCanisterId() });
  }
  return _actor;
}

const VALID_ROLES = new Set<string>(["Homeowner", "Contractor", "Realtor", "Builder"]);

function fromProfile(raw: any): UserProfile {
  const roleKey = Object.keys(raw.role)[0];
  if (!VALID_ROLES.has(roleKey)) throw new Error(`Unknown user role from canister: "${roleKey}"`);
  return {
    principal:    raw.principal.toText(),
    role:         roleKey as UserRole,
    email:        raw.email,
    phone:        raw.phone,
    createdAt:    raw.createdAt,
    updatedAt:    raw.updatedAt,
    isActive:     raw.isActive,
    lastLoggedIn:       raw.lastLoggedIn[0] != null
      ? Number(raw.lastLoggedIn[0]) / 1_000_000
      : null,
    onboardingComplete: raw.onboardingComplete?.[0] === true,
  };
}

function unwrap(result: any): UserProfile {
  if ("ok" in result) return fromProfile(result.ok);
  const key = Object.keys(result.err)[0];
  const val = result.err[key];
  throw new Error(typeof val === "string" ? val : key);
}

export const authService = {
  async register(args: RegisterArgs): Promise<UserProfile> {
    const a = await getActor();
    const result = await a.register({
      role: { [args.role]: null },
      email: args.email,
      phone: args.phone,
    });
    return unwrap(result);
  },

  async getProfile(): Promise<UserProfile> {
    const a = await getActor();
    const result = await a.getProfile();
    return unwrap(result);
  },

  async updateProfile(args: { email: string; phone: string }): Promise<UserProfile> {
    const a = await getActor();
    const result = await a.updateProfile(args);
    return unwrap(result);
  },

  async recordLogin(): Promise<void> {
    const a = await getActor();
    await a.recordLogin();
  },

  async completeOnboarding(): Promise<void> {
    if (!getCanisterId()) return;
    const a = await getActor();
    await a.completeOnboarding();
  },

  async hasRole(role: UserRole): Promise<boolean> {
    const a = await getActor();
    return a.hasRole({ [role]: null });
  },

  reset() {
    _actor = null;
  },
};
