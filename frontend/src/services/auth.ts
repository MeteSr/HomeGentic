import { Actor } from "@icp-sdk/core/agent";
import { getAgent } from "./actor";

function getCanisterId() { return (process.env as any).AUTH_CANISTER_ID || ""; }

export const idlFactory = ({ IDL }: any) => {
  const UserRole = IDL.Variant({
    Homeowner:  IDL.Null,
    Contractor: IDL.Null,
    Realtor:    IDL.Null,
    Builder:    IDL.Null,   // added with Builder role
  });
  const UserProfile = IDL.Record({
    principal:    IDL.Principal,
    role:         UserRole,
    email:        IDL.Text,
    phone:        IDL.Text,
    createdAt:    IDL.Int,
    updatedAt:    IDL.Int,
    isActive:     IDL.Bool,
    lastLoggedIn: IDL.Opt(IDL.Int),
  });
  const RegisterArgs = IDL.Record({
    role:  UserRole,
    email: IDL.Text,
    phone: IDL.Text,
  });
  const UpdateArgs = IDL.Record({ email: IDL.Text, phone: IDL.Text });
  const Error = IDL.Variant({
    NotFound:      IDL.Null,
    AlreadyExists: IDL.Null,
    NotAuthorized: IDL.Null,
    Paused:        IDL.Null,
    InvalidInput:  IDL.Text,
  });
  const Result    = IDL.Variant({ ok: UserProfile, err: Error });
  const UserStats = IDL.Record({
    total:          IDL.Nat,
    newToday:       IDL.Nat,
    newThisWeek:    IDL.Nat,
    activeThisWeek: IDL.Nat,
    homeowners:     IDL.Nat,
    contractors:    IDL.Nat,
    realtors:       IDL.Nat,
    builders:       IDL.Nat,
  });
  return IDL.Service({
    register:      IDL.Func([RegisterArgs], [Result], []),
    getProfile:    IDL.Func([], [Result], ["query"]),
    updateProfile: IDL.Func([UpdateArgs], [Result], []),
    recordLogin:   IDL.Func([], [], []),
    hasRole:       IDL.Func([UserRole], [IDL.Bool], ["query"]),
    getUserStats:  IDL.Func([], [UserStats], ["query"]),
    getMetrics: IDL.Func(
      [],
      [IDL.Record({
        totalUsers:  IDL.Nat,
        homeowners:  IDL.Nat,
        contractors: IDL.Nat,
        realtors:    IDL.Nat,
        builders:    IDL.Nat,
        isPaused:    IDL.Bool,
      })],
      ["query"]
    ),
  });
};

export type UserRole = "Homeowner" | "Contractor" | "Realtor";

export interface UserProfile {
  principal:    string;
  role:         UserRole;
  email:        string;
  phone:        string;
  createdAt:    bigint;
  updatedAt:    bigint;
  isActive:     boolean;
  lastLoggedIn: number | null;  // ms timestamp of previous login; null on first login
}

export interface RegisterArgs {
  role: UserRole;
  email: string;
  phone: string;
}

let _actor: any = null;
let _mockProfile: UserProfile | null = null;

async function getActor() {
  if (!_actor) {
    const ag = await getAgent();
    _actor = Actor.createActor(idlFactory, { agent: ag, canisterId: getCanisterId() });
  }
  return _actor;
}

function fromProfile(raw: any): UserProfile {
  return {
    principal:    raw.principal.toText(),
    role:         Object.keys(raw.role)[0] as UserRole,
    email:        raw.email,
    phone:        raw.phone,
    createdAt:    raw.createdAt,
    updatedAt:    raw.updatedAt,
    isActive:     raw.isActive,
    lastLoggedIn: raw.lastLoggedIn[0] != null
      ? Number(raw.lastLoggedIn[0]) / 1_000_000
      : null,
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
    if (!getCanisterId()) {
      _mockProfile = {
        principal:    "local-dev",
        role:         args.role,
        email:        args.email,
        phone:        args.phone,
        createdAt:    BigInt(Date.now()),
        updatedAt:    BigInt(Date.now()),
        isActive:     true,
        lastLoggedIn: null,
      };
      return { ..._mockProfile };
    }
    const a = await getActor();
    const result = await a.register({
      role: { [args.role]: null },
      email: args.email,
      phone: args.phone,
    });
    return unwrap(result);
  },

  async getProfile(): Promise<UserProfile> {
    if (!getCanisterId()) {
      if (!_mockProfile) {
        // No canister deployed and no profile registered yet (e.g. devLogin without a
        // running replica). Seed a default homeowner so devLogin can navigate to /dashboard
        // instead of falling through to /register.
        _mockProfile = {
          principal:    "local-dev",
          role:         "Homeowner",
          email:        "dev@homegentic.io",
          phone:        "0000000000",
          createdAt:    BigInt(0),
          updatedAt:    BigInt(0),
          isActive:     true,
          lastLoggedIn: null,
        };
      }
      return { ..._mockProfile };
    }
    const a = await getActor();
    const result = await a.getProfile();
    return unwrap(result);
  },

  async updateProfile(args: { email: string; phone: string }): Promise<UserProfile> {
    if (!getCanisterId()) {
      if (!_mockProfile) throw new Error("User profile not found — call createProfile() before updateProfile()");
      _mockProfile = { ..._mockProfile, email: args.email, phone: args.phone, updatedAt: BigInt(Date.now()) };
      return { ..._mockProfile };
    }
    const a = await getActor();
    const result = await a.updateProfile(args);
    return unwrap(result);
  },

  async recordLogin(): Promise<void> {
    if (!getCanisterId()) return;
    const a = await getActor();
    await a.recordLogin();
  },

  async hasRole(role: UserRole): Promise<boolean> {
    if (!getCanisterId()) return _mockProfile?.role === role;
    const a = await getActor();
    return a.hasRole({ [role]: null });
  },

  reset() {
    _actor = null;
    _mockProfile = null;
  },
};
