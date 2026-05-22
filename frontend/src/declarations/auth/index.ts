// Candid interface for the auth canister — keep in sync with backend/auth/main.mo
export const idlFactory = ({ IDL }: any) => {
  const UserRole = IDL.Variant({
    Homeowner:  IDL.Null,
    Contractor: IDL.Null,
    Realtor:    IDL.Null,
    Builder:    IDL.Null,   // added with Builder role
  });
  const UserProfile = IDL.Record({
    principal:          IDL.Principal,
    role:               UserRole,
    email:              IDL.Text,
    phone:              IDL.Text,
    createdAt:          IDL.Int,
    updatedAt:          IDL.Int,
    isActive:           IDL.Bool,
    lastLoggedIn:       IDL.Opt(IDL.Int),
    onboardingComplete: IDL.Opt(IDL.Bool),
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
    recordLogin:        IDL.Func([], [], []),
    completeOnboarding: IDL.Func([], [], []),
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
