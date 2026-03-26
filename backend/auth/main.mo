/**
 * HomeFax Auth Canister
 * Handles user registration, profiles, and role management.
 * Supports Homeowner, Contractor, and Realtor roles.
 */

import HashMap "mo:base/HashMap";
import Iter "mo:base/Iter";
import Principal "mo:base/Principal";
import Result "mo:base/Result";
import Text "mo:base/Text";
import Time "mo:base/Time";
import Array "mo:base/Array";

persistent actor Auth {

  // ─── Types ──────────────────────────────────────────────────────────────────

  /// User roles available in the HomeFax platform
  public type UserRole = {
    #Homeowner;
    #Contractor;
    #Realtor;
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
  private var admins: [Principal] = [];

  /// Stable entries for HashMap persistence across upgrades
  private var userEntries: [(Principal, UserProfile)] = [];

  // ─── Mutable State ───────────────────────────────────────────────────────────

  /// In-memory HashMap for fast lookups; rebuilt from stable entries on upgrade
  private transient var users = HashMap.fromIter<Principal, UserProfile>(
    userEntries.vals(),
    16,
    Principal.equal,
    Principal.hash
  );

  // ─── Upgrade Hooks ───────────────────────────────────────────────────────────

  /// Save HashMap contents to stable variables before canister upgrade
  system func preupgrade() {
    userEntries := Iter.toArray(users.entries());
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
    if (isPaused) #err(#Paused) else #ok(())
  };

  // ─── Admin Controls ───────────────────────────────────────────────────────────

  /// Add a new admin principal
  public shared(msg) func addAdmin(newAdmin: Principal) : async Result.Result<(), Error> {
    if (admins.size() > 0 and not isAdmin(msg.caller)) return #err(#NotAuthorized);
    admins := Array.append(admins, [newAdmin]);
    #ok(())
  };

  /// Pause the canister (admin only) — prevents all write operations
  public shared(msg) func pause() : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    isPaused := true;
    #ok(())
  };

  /// Unpause the canister (admin only)
  public shared(msg) func unpause() : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    isPaused := false;
    #ok(())
  };

  // ─── User Functions ───────────────────────────────────────────────────────────

  /// Register a new user with a role, email, and phone number
  public shared(msg) func register(args: RegisterArgs) : async Result.Result<UserProfile, Error> {
    switch (requireActive()) { case (#err(e)) return #err(e); case _ {} };

    let caller = msg.caller;

    if (users.get(caller) != null) return #err(#AlreadyExists);
    // Email and phone are optional; validate format only when provided
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

    users.put(caller, profile);
    #ok(profile)
  };

  /// Get the caller's profile
  public query(msg) func getProfile() : async Result.Result<UserProfile, Error> {
    switch (users.get(msg.caller)) {
      case null { #err(#NotFound) };
      case (?p) { #ok(p) };
    }
  };

  /// Update the caller's email and phone
  public shared(msg) func updateProfile(args: UpdateArgs) : async Result.Result<UserProfile, Error> {
    switch (requireActive()) { case (#err(e)) return #err(e); case _ {} };

    switch (users.get(msg.caller)) {
      case null { #err(#NotFound) };
      case (?existing) {
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
        users.put(msg.caller, updated);
        #ok(updated)
      };
    }
  };

  /// Record the current time as the caller's last login.
  /// Called by the frontend immediately after reading the profile, so the
  /// profile read returns the *previous* session's timestamp for comparison.
  public shared(msg) func recordLogin() : async () {
    switch (users.get(msg.caller)) {
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
        users.put(msg.caller, updated);
      };
    }
  };

  /// Check if the caller has a specific role
  public query(msg) func hasRole(role: UserRole) : async Bool {
    switch (users.get(msg.caller)) {
      case null { false };
      case (?p) {
        switch (role, p.role) {
          case (#Homeowner, #Homeowner) { true };
          case (#Contractor, #Contractor) { true };
          case (#Realtor, #Realtor) { true };
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

    for (profile in users.vals()) {
      switch (profile.role) {
        case (#Homeowner) { homeowners += 1 };
        case (#Contractor) { contractors += 1 };
        case (#Realtor) { realtors += 1 };
      };
    };

    {
      totalUsers = users.size();
      homeowners;
      contractors;
      realtors;
      isPaused;
    }
  };
}
