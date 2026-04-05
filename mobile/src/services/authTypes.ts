/** Shared types and pure data transformation — no @dfinity/agent dependency. */

export type UserRole = "Homeowner" | "Contractor" | "Realtor";

export interface UserProfile {
  principal:    string;
  role:         UserRole;
  email:        string;
  phone:        string;
  createdAt:    bigint;
  updatedAt:    bigint;
  isActive:     boolean;
  lastLoggedIn: number | null;
}

/** Transform raw Candid response into a typed UserProfile. Pure — safe to unit test. */
export function fromProfile(raw: any): UserProfile {
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
