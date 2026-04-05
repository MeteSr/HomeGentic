/**
 * HomeGentic Auth Canister
 * Handles user registration, profiles, and role management.
 * Supports Homeowner, Contractor, Realtor, and Builder roles.
 */

import Map "mo:core/Map";
import Iter "mo:core/Iter";
import Principal "mo:core/Principal";
import Result "mo:core/Result";
import Text "mo:core/Text";
import Time "mo:core/Time";
import Array "mo:core/Array";

persistent actor Auth {

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
    principal: Principal;
    role: UserRole;
    email: Text;
    phone: Text;
    createdAt: Int;
    updatedAt: Int;
    isActive: Bool;
    lastLoggedIn: ?Int;   // null until first recordLogin() call
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
  private var admins: [Principal] = [];
  private var adminInitialized: Bool = false;

  /// Stable entries for HashMap persistence across upgrades
  private var userEntries: [(Principal, UserProfile)] = [];

  // ─── Mutable State ───────────────────────────────────────────────────────────

  /// In-memory Map for fast lookups; rebuilt from stable entries on upgrade
  private transient var users = Map.fromIter<Principal, UserProfile>(
    userEntries.vals(),
    Principal.compare
  );

  // ─── Upgrade Hooks ───────────────────────────────────────────────────────────

  /// Save Map contents to stable variables before canister upgrade
  system func preupgrade() {
    userEntries := Iter.toArray(Map.entries(users));
  };

  /// Clear stable entries after upgrade (data is back in HashMap)
  system func postupgrade() {
    userEntries := [];
  };

  // ─── Private Helpers ─────────────────────────────────────────────────────────

  private func isAdmin(caller: Principal) : Bool {
    Array.find<Principal>(admins, func (a) { a == caller }) != null
  };

  private func requireActive() : Result.Result<(), Error> {
    if (not isPaused) return #ok(());
    switch (pauseExpiryNs) {
      case (?expiry) { if (Time.now() >= expiry) return #ok(()) };
      case null {};
    };
    #err(#Paused)
  };

  // ─── Admin Controls ───────────────────────────────────────────────────────────

  /// Add a new admin principal
  public shared(msg) func addAdmin(newAdmin: Principal) : async Result.Result<(), Error> {
    if (adminInitialized and not isAdmin(msg.caller)) return #err(#NotAuthorized);
    admins := Array.concat(admins, [newAdmin]);
    adminInitialized := true;
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

  // ─── User Functions ───────────────────────────────────────────────────────────

  /// Register a new user with a role, email, and phone number
  public shared(msg) func register(args: RegisterArgs) : async Result.Result<UserProfile, Error> {
    switch (requireActive()) { case (#err(e)) return #err(e); case _ {} };

    let caller = msg.caller;

    if (Map.get(users, Principal.compare, caller) != null) return #err(#AlreadyExists);
    // Email and phone are optional; validate format only when provided
    if (Text.size(args.email) > 256) return #err(#InvalidInput("email exceeds 256 characters"));
    if (Text.size(args.phone) > 30)  return #err(#InvalidInput("phone exceeds 30 characters"));
    if (Text.size(args.email) > 0 and not Text.contains(args.email, #text "@"))
      return #err(#InvalidInput("Email must contain @"));

    let now = Time.now();
    let profile: UserProfile = {
      principal    = caller;
      role         = args.role;
      email        = args.email;
      phone        = args.phone;
      createdAt    = now;
      updatedAt    = now;
      isActive     = true;
      lastLoggedIn = null;
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
    switch (requireActive()) { case (#err(e)) return #err(e); case _ {} };

    switch (Map.get(users, Principal.compare, msg.caller)) {
      case null { #err(#NotFound) };
      case (?existing) {
        if (Text.size(args.email) > 256) return #err(#InvalidInput("email exceeds 256 characters"));
        if (Text.size(args.phone) > 30)  return #err(#InvalidInput("phone exceeds 30 characters"));
        if (Text.size(args.email) > 0 and not Text.contains(args.email, #text "@"))
          return #err(#InvalidInput("Email must contain @"));

        let updated: UserProfile = {
          principal    = existing.principal;
          role         = existing.role;
          email        = args.email;
          phone        = args.phone;
          createdAt    = existing.createdAt;
          updatedAt    = Time.now();
          isActive     = existing.isActive;
          lastLoggedIn = existing.lastLoggedIn;
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
          principal    = existing.principal;
          role         = existing.role;
          email        = existing.email;
          phone        = existing.phone;
          createdAt    = existing.createdAt;
          updatedAt    = existing.updatedAt;
          isActive     = existing.isActive;
          lastLoggedIn = ?Time.now();
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
