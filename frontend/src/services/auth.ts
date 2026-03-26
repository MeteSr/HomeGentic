import { Actor } from "@dfinity/agent";
import { getAgent } from "./actor";

const AUTH_CANISTER_ID = (process.env as any).AUTH_CANISTER_ID || "";

const idlFactory = ({ IDL }: any) => {
  const UserRole = IDL.Variant({
    Homeowner: IDL.Null,
    Contractor: IDL.Null,
    Realtor: IDL.Null,
  });
  const UserProfile = IDL.Record({
    principal: IDL.Principal,
    role: UserRole,
    email: IDL.Text,
    phone: IDL.Text,
    createdAt: IDL.Int,
    updatedAt: IDL.Int,
    isActive: IDL.Bool,
  });
  const RegisterArgs = IDL.Record({
    role: UserRole,
    email: IDL.Text,
    phone: IDL.Text,
  });
  const UpdateArgs = IDL.Record({ email: IDL.Text, phone: IDL.Text });
  const Error = IDL.Variant({
    NotFound: IDL.Null,
    AlreadyExists: IDL.Null,
    NotAuthorized: IDL.Null,
    Paused: IDL.Null,
    InvalidInput: IDL.Text,
  });
  const Result = IDL.Variant({ ok: UserProfile, err: Error });
  return IDL.Service({
    register: IDL.Func([RegisterArgs], [Result], []),
    getProfile: IDL.Func([], [Result], ["query"]),
    updateProfile: IDL.Func([UpdateArgs], [Result], []),
    hasRole: IDL.Func([UserRole], [IDL.Bool], ["query"]),
    getMetrics: IDL.Func(
      [],
      [
        IDL.Record({
          totalUsers: IDL.Nat,
          homeowners: IDL.Nat,
          contractors: IDL.Nat,
          realtors: IDL.Nat,
          isPaused: IDL.Bool,
        }),
      ],
      ["query"]
    ),
  });
};

export type UserRole = "Homeowner" | "Contractor" | "Realtor";

export interface UserProfile {
  principal: string;
  role: UserRole;
  email: string;
  phone: string;
  createdAt: bigint;
  updatedAt: bigint;
  isActive: boolean;
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
    _actor = Actor.createActor(idlFactory, { agent: ag, canisterId: AUTH_CANISTER_ID });
  }
  return _actor;
}

function fromProfile(raw: any): UserProfile {
  return {
    principal: raw.principal.toText(),
    role: Object.keys(raw.role)[0] as UserRole,
    email: raw.email,
    phone: raw.phone,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    isActive: raw.isActive,
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

  async hasRole(role: UserRole): Promise<boolean> {
    const a = await getActor();
    return a.hasRole({ [role]: null });
  },

  reset() {
    _actor = null;
  },
};
