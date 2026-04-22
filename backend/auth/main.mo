/**
 * HomeGentic Auth Canister
 * Handles user registration, profiles, and role management.
 * Supports Homeowner, Contractor, Realtor, and Builder roles.
 */

import Map "mo:core/Map";
import Nat "mo:core/Nat";
import Principal "mo:core/Principal";
import Result "mo:core/Result";
import Text "mo:core/Text";
import Time "mo:core/Time";
import Array "mo:core/Array";

persistent actor class Auth(initDeployer : Principal) {

  // ─── Types ──────────────────────────────────────────────────────────────────

  /// User roles available in the HomeGentic platform
  public type UserRole = {
    #Homeowner;
    #Contractor;
    #Realtor;
    #Builder;
  };

  /// Complete user profile stored on-chain
  public type UserProfile = {
    principal:          Principal;
    role:               UserRole;
    email:              Text;
    phone:              Text;
    createdAt:          Int;
    updatedAt:          Int;
    isActive:           Bool;
    lastLoggedIn:       ?Int;   // null until first recordLogin() call
    onboardingComplete: ?Bool;  // null = never set (treat as false); upgrade-safe optional
  };

  public type RegisterArgs = {
    role: UserRole;
    email: Text;
    phone: Text;
  };

  public type UpdateArgs = {
    email: Text;
    phone: Text;
  };

  public type Metrics = {
    totalUsers: Nat;
    homeowners: Nat;
    contractors: Nat;
    realtors: Nat;
    builders: Nat;
    isPaused: Bool;
  };

  public type UserStats = {
    total: Nat;
    newToday: Nat;
    newThisWeek: Nat;
    activeThisWeek: Nat;   // users with lastLoggedIn in the last 7 days
    homeowners: Nat;
    contractors: Nat;
    realtors: Nat;
    builders: Nat;
  };

  public type Error = {
    #NotFound;
    #AlreadyExists;
    #NotAuthorized;
    #Paused;
    #InvalidInput: Text;
  };

  // ─── Stable State (persists across upgrades) ─────────────────────────────────

  private var isPaused: Bool = false;
  private var pauseExpiryNs: ?Int = null;
  // initDeployer is set atomically at install time — no open window for a
  // first-caller race. On upgrade, stable storage restores the existing value.
  private var admins: [Principal] = [initDeployer];

  /// Per-principal update-call rate limiting (cycle-drain protection).
  private transient let updateCallLimits : Map.Map<Text, (Nat, Int)> = Map.empty();

  // ─── Stable State ────────────────────────────────────────────────────────────

  /// Map is stable directly (mo:core/Map uses a stable B-tree internally).
  /// No preupgrade serialisation required — eliminates the upgrade instruction-limit footgun.
  private let users = Map.empty<Principal, UserProfile>();

  // ─── Ingress Inspection ───────────────────────────────────────────────────────

  /// Reject ingress calls to argument-bearing update methods when the raw Candid
  /// payload is empty (0 bytes). An empty buffer cannot be valid Candid for any
  /// method that takes a struct argument — these are probe / garbage calls that
  /// would waste cycles. Rejected here before execution, no charge to the canister.
  system func inspect({ caller : Principal; arg : Blob }) : Bool {
    // Reject anonymous principals and empty-payload calls from all update paths.
    // Empty payload cannot be valid Candid for any method that takes a struct
    // argument — these are probe / garbage calls that waste cycles.
    not Principal.isAnonymous(caller) and arg.size() > 0
  };

  // ─── Private Helpers ─────────────────────────────────────────────────────────

  private func isAdmin(caller: Principal) : Bool {
    Array.find<Principal>(admins, func (a) { a == caller }) != null
  };

  // ─── Rate Limit (cycle-drain protection) ────────────────────────────────────

  /// Admin-adjustable rate limit — default 30/min. Lower for tighter protection,
  /// raise for bulk-operation accounts, set to 0 to disable enforcement.
  private var maxUpdatesPerMin : Nat = 30;
  private let ONE_MINUTE_NS       : Int = 60_000_000_000;

  /// Returns true and bumps the counter if the caller is under the 120/min limit.
  /// Admins are always exempt. Window resets after 60 s.
  private func tryConsumeUpdateSlot(caller: Principal) : Bool {
    if (isAdmin(caller)) return true;
    let key = Principal.toText(caller);
    let now = Time.now();
    switch (Map.get(updateCallLimits, Text.compare, key)) {
      case null {
        Map.add(updateCallLimits, Text.compare, key, (1, now));
        true
      };
      case (?(count, windowStart)) {
        if (now - windowStart >= ONE_MINUTE_NS) {
          Map.add(updateCallLimits, Text.compare, key, (1, now));
          true
        } else if (maxUpdatesPerMin > 0 and count >= maxUpdatesPerMin) {
          false
        } else {
          Map.add(updateCallLimits, Text.compare, key, (count + 1, windowStart));
          true
        }
      };
    }
  };

  private func requireActive(caller: Principal) : Result.Result<(), Error> {
    if (Principal.isAnonymous(caller)) return #err(#NotAuthorized);
    if (isPaused) {
      switch (pauseExpiryNs) {
        case (?expiry) { if (Time.now() < expiry) return #err(#Paused) };
        case null { return #err(#Paused) };
      };
    };
    if (not tryConsumeUpdateSlot(caller)) {
      return #err(#InvalidInput("Rate limit exceeded. Max " # Nat.toText(maxUpdatesPerMin) # " update calls per minute per principal."))
    };
    #ok(())
  };

  // ─── Admin Controls ───────────────────────────────────────────────────────────

  /// Set the update-call rate limit (admin only). Pass 0 to disable enforcement.
  public shared(msg) func setUpdateRateLimit(n: Nat) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    maxUpdatesPerMin := n;
    #ok(())
  };

  /// Add a new admin principal (existing admin only — bootstrap is closed at install time)
  public shared(msg) func addAdmin(newAdmin: Principal) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    if (not isAdmin(newAdmin)) {
      admins := Array.concat(admins, [newAdmin]);
    };
    #ok(())
  };

  /// Pause the canister (admin only) — prevents all write operations
  public shared(msg) func pause(durationSeconds: ?Nat) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    isPaused := true;
    pauseExpiryNs := switch (durationSeconds) {
      case null    { null };
      case (?secs) { ?(Time.now() + secs * 1_000_000_000) };
    };
    #ok(())
  };

  /// Unpause the canister (admin only)
  public shared(msg) func unpause() : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    isPaused := false;
    pauseExpiryNs := null;
    #ok(())
  };

  // ─── Validation Helpers ───────────────────────────────────────────────────────

  /// Returns a descriptive error message when the email is malformed, null when valid.
  /// Email is optional in auth (empty string is allowed); call only when non-empty.
  private func validateEmail(email: Text) : ?Text {
    if (Text.size(email) > 254)
      return ?"email exceeds 254 characters";
    if (not Text.contains(email, #text "@"))
      return ?"email must contain @";
    if (Text.contains(email, #text " "))
      return ?"email must not contain spaces";
    null
  };

  // ─── User Functions ───────────────────────────────────────────────────────────

  /// Register a new user with a role, email, and phone number
  public shared(msg) func register(args: RegisterArgs) : async Result.Result<UserProfile, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };

    let caller = msg.caller;

    if (Map.get(users, Principal.compare, caller) != null) return #err(#AlreadyExists);
    // Email and phone are optional; validate format only when provided
    if (Text.size(args.phone) > 30)  return #err(#InvalidInput("phone exceeds 30 characters"));
    if (Text.size(args.email) > 0) {
      switch (validateEmail(args.email)) {
        case (?msg) return #err(#InvalidInput(msg));
        case null   {};
      };
    };

    let now = Time.now();
    let profile: UserProfile = {
      principal          = caller;
      role               = args.role;
      email              = args.email;
      phone              = args.phone;
      createdAt          = now;
      updatedAt          = now;
      isActive           = true;
      lastLoggedIn       = null;
      onboardingComplete = null;
    };

    Map.add(users, Principal.compare, caller, profile);
    #ok(profile)
  };

  /// Get the caller's profile
  public query(msg) func getProfile() : async Result.Result<UserProfile, Error> {
    switch (Map.get(users, Principal.compare, msg.caller)) {
      case null { #err(#NotFound) };
      case (?p) { #ok(p) };
    }
  };

  /// Update the caller's email and phone
  public shared(msg) func updateProfile(args: UpdateArgs) : async Result.Result<UserProfile, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };

    switch (Map.get(users, Principal.compare, msg.caller)) {
      case null { #err(#NotFound) };
      case (?existing) {
        if (Text.size(args.phone) > 30) return #err(#InvalidInput("phone exceeds 30 characters"));
        if (Text.size(args.email) > 0) {
          switch (validateEmail(args.email)) {
            case (?msg) return #err(#InvalidInput(msg));
            case null   {};
          };
        };

        let updated: UserProfile = {
          principal          = existing.principal;
          role               = existing.role;
          email              = args.email;
          phone              = args.phone;
          createdAt          = existing.createdAt;
          updatedAt          = Time.now();
          isActive           = existing.isActive;
          lastLoggedIn       = existing.lastLoggedIn;
          onboardingComplete = existing.onboardingComplete;
        };
        Map.add(users, Principal.compare, msg.caller, updated);
        #ok(updated)
      };
    }
  };

  /// Record the current time as the caller's last login.
  /// Called by the frontend immediately after reading the profile, so the
  /// profile read returns the *previous* session's timestamp for comparison.
  public shared(msg) func recordLogin() : async () {
    switch (Map.get(users, Principal.compare, msg.caller)) {
      case null {};  // Not registered yet — ignore
      case (?existing) {
        let updated: UserProfile = {
          principal          = existing.principal;
          role               = existing.role;
          email              = existing.email;
          phone              = existing.phone;
          createdAt          = existing.createdAt;
          updatedAt          = existing.updatedAt;
          isActive           = existing.isActive;
          lastLoggedIn       = ?Time.now();
          onboardingComplete = existing.onboardingComplete;
        };
        Map.add(users, Principal.compare, msg.caller, updated);
      };
    }
  };

  /// Mark the caller's onboarding as complete so they are not redirected
  /// to the wizard on subsequent logins.
  public shared(msg) func completeOnboarding() : async () {
    switch (Map.get(users, Principal.compare, msg.caller)) {
      case null {};  // Not registered yet — ignore
      case (?existing) {
        let updated: UserProfile = {
          principal          = existing.principal;
          role               = existing.role;
          email              = existing.email;
          phone              = existing.phone;
          createdAt          = existing.createdAt;
          updatedAt          = existing.updatedAt;
          isActive           = existing.isActive;
          lastLoggedIn       = existing.lastLoggedIn;
          onboardingComplete = ?true;
        };
        Map.add(users, Principal.compare, msg.caller, updated);
      };
    }
  };

  /// Check if the caller has a specific role
  public query(msg) func hasRole(role: UserRole) : async Bool {
    switch (Map.get(users, Principal.compare, msg.caller)) {
      case null { false };
      case (?p) {
        switch (role, p.role) {
          case (#Homeowner, #Homeowner) { true };
          case (#Contractor, #Contractor) { true };
          case (#Realtor, #Realtor) { true };
          case (#Builder, #Builder) { true };
          case _ { false };
        }
      };
    }
  };

  // ─── Metrics ─────────────────────────────────────────────────────────────────

  /// Time-based user stats — new signups and engagement for the admin dashboard.
  public query func getUserStats() : async UserStats {
    let now     = Time.now();
    let dayNs   : Int = 24 * 60 * 60 * 1_000_000_000;
    let weekNs  : Int = 7 * dayNs;

    var total         = 0;
    var newToday      = 0;
    var newThisWeek   = 0;
    var activeThisWeek = 0;
    var homeowners    = 0;
    var contractors   = 0;
    var realtors      = 0;
    var builders      = 0;

    for (profile in Map.values(users)) {
      total += 1;
      if (now - profile.createdAt <= dayNs)  { newToday += 1 };
      if (now - profile.createdAt <= weekNs) { newThisWeek += 1 };
      switch (profile.lastLoggedIn) {
        case (?t) { if (now - t <= weekNs) { activeThisWeek += 1 } };
        case null {};
      };
      switch (profile.role) {
        case (#Homeowner)  { homeowners  += 1 };
        case (#Contractor) { contractors += 1 };
        case (#Realtor)    { realtors    += 1 };
        case (#Builder)    { builders    += 1 };
      };
    };

    { total; newToday; newThisWeek; activeThisWeek; homeowners; contractors; realtors; builders }
  };

  /// Return platform-level metrics (public read)
  public query func getMetrics() : async Metrics {
    var homeowners = 0;
    var contractors = 0;
    var realtors = 0;
    var builders = 0;

    for (profile in Map.values(users)) {
      switch (profile.role) {
        case (#Homeowner) { homeowners += 1 };
        case (#Contractor) { contractors += 1 };
        case (#Realtor) { realtors += 1 };
        case (#Builder) { builders += 1 };
      };
    };

    {
      totalUsers = Map.size(users);
      homeowners;
      contractors;
      realtors;
      builders;
      isPaused;
    }
  };
}
