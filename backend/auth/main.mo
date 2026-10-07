/**
 * HomeGentic Auth Canister
 * Handles user registration, profiles, and role management.
 * Supports Homeowner, Contractor, Realtor, and Builder roles.
 */

import Array "mo:core/Array";
import Blob "mo:core/Blob";
import Debug "mo:core/Debug";
import Iter "mo:core/Iter";
import Map "mo:core/Map";
import Nat "mo:core/Nat";
import Nat8 "mo:core/Nat8";
import Option "mo:core/Option";
import Principal "mo:core/Principal";
import Random "mo:core/Random";
import Result "mo:core/Result";
import Text "mo:core/Text";
import Time "mo:core/Time";

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
    errorsByMethod : [(Text, Nat)];
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
  private var auditCanisterId : ?Principal = null;

  /// Per-principal update-call rate limiting (cycle-drain protection).
  private let updateCallLimits : Map.Map<Text, (Nat, Int)> = Map.empty();

  // ─── Stable State ────────────────────────────────────────────────────────────

  /// Map is stable directly (mo:core/Map uses a stable B-tree internally).
  /// No preupgrade serialisation required — eliminates the upgrade instruction-limit footgun.
  private let users = Map.empty<Principal, UserProfile>();
  private let errsByMethod : Map.Map<Text, Nat> = Map.empty();

  /// Voice-agent sessions: bearer token → owner. Lets the off-chain voice
  /// Worker learn which principal a request really comes from — the IC
  /// authenticates the issueAgentSession call, so only the owner can mint a
  /// token for itself. At most one live token per principal.
  public type AgentSession = { owner : Principal; expiresAt : Int };
  private let agentSessions       = Map.empty<Text, AgentSession>();
  private let agentSessionByOwner = Map.empty<Principal, Text>();
  private transient let AGENT_SESSION_TTL_NS : Int = 24 * 60 * 60 * 1_000_000_000;

  /// Principals allowed to look up a user's email for notifications — the
  /// notification relay's identity (agents/notifications). Admin-managed.
  private var notifierEntries : [Principal] = [];

  private func countError(method : Text) {
    let prev = Option.get(Map.get(errsByMethod, Text.compare, method), 0);
    if (prev < 999_999) {
      Map.add(errsByMethod, Text.compare, method, prev + 1);
    };
  };

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

  private func isNotifier(p: Principal) : Bool {
    Array.find<Principal>(notifierEntries, func (n) { n == p }) != null
  };

  // ─── Rate Limit (cycle-drain protection) ────────────────────────────────────

  /// Admin-adjustable rate limit — default 30/min. Lower for tighter protection,
  /// raise for bulk-operation accounts, set to 0 to disable enforcement.
  private var maxUpdatesPerMin : Nat = 30;
  private transient let ONE_MINUTE_NS       : Int = 60_000_000_000;

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
    try { ignore await auditLog("AdminAdded", ?newAdmin, "caller=" # Principal.toText(msg.caller)) } catch _ { Debug.print("[auth] fire-and-forget call failed") };
    #ok(())
  };

  /// Remove an existing admin principal (existing admin only).
  public shared(msg) func removeAdmin(target: Principal) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    admins := Array.filter<Principal>(admins, func(a) { a != target });
    try { ignore await auditLog("AdminRemoved", ?target, "caller=" # Principal.toText(msg.caller)) } catch _ { Debug.print("[auth] fire-and-forget call failed") };
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
    try { ignore await auditLog("CanisterPaused", null, "caller=" # Principal.toText(msg.caller)) } catch _ { Debug.print("[auth] fire-and-forget call failed") };
    #ok(())
  };

  /// Unpause the canister (admin only)
  public shared(msg) func unpause() : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    isPaused := false;
    pauseExpiryNs := null;
    try { ignore await auditLog("CanisterUnpaused", null, "caller=" # Principal.toText(msg.caller)) } catch _ { Debug.print("[auth] fire-and-forget call failed") };
    #ok(())
  };

  public shared(msg) func setAuditCanisterId(id : Principal) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    try { ignore await auditLog("AuditCanisterSet", ?id, "caller=" # Principal.toText(msg.caller)) } catch _ { Debug.print("[auth] fire-and-forget call failed") };
    auditCanisterId := ?id;
    #ok(())
  };

  private func auditLog(action : Text, subject : ?Principal, detail : Text) : async () {
    switch (auditCanisterId) {
      case null {};
      case (?aid) {
        let a : actor {
          log : (Text, Text, ?Principal, Text) -> async { #ok : Nat; #err : { #NotAuthorized; #InvalidInput : Text } }
        } = actor(Principal.toText(aid));
        try { ignore await a.log("auth", action, subject, detail) } catch _ { Debug.print("[auth] fire-and-forget call failed") };
      };
    };
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

    if (Map.get(users, Principal.compare, caller) != null) {
      Debug.print("auth.register: already exists: " # Principal.toText(caller));
      countError("register");
      return #err(#AlreadyExists);
    };
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

  // ─── Voice-agent sessions ────────────────────────────────────────────────────

  private func blobToHex(b : Blob) : Text {
    let hex = ['0','1','2','3','4','5','6','7','8','9','a','b','c','d','e','f'];
    var out = "";
    for (byte in Blob.toArray(b).vals()) {
      let n = Nat8.toNat(byte);
      out := out # Text.fromChar(hex[n / 16]) # Text.fromChar(hex[n % 16]);
    };
    out
  };

  private func dropAgentSession(owner : Principal) {
    switch (Map.get(agentSessionByOwner, Principal.compare, owner)) {
      case (?old) { Map.remove(agentSessions, Text.compare, old) };
      case null {};
    };
    Map.remove(agentSessionByOwner, Principal.compare, owner);
  };

  /// Issue a 24-hour voice-agent session token for the caller (registered
  /// users only), replacing any earlier one. The frontend sends it to the
  /// voice Worker, which resolves it back to the caller with
  /// resolveAgentSession — so the Worker never has to trust a principal the
  /// client merely asserts.
  public shared(msg) func issueAgentSession() : async Result.Result<{ token : Text; expiresAt : Int }, Error> {
    switch (requireActive(msg.caller)) { case (#err(e)) return #err(e); case _ {} };
    if (Map.get(users, Principal.compare, msg.caller) == null) return #err(#NotFound);

    let token     = "hgs_" # blobToHex(await Random.blob());   // 256 bits of IC randomness
    let expiresAt = Time.now() + AGENT_SESSION_TTL_NS;
    dropAgentSession(msg.caller);
    Map.add(agentSessions, Text.compare, token, { owner = msg.caller; expiresAt });
    Map.add(agentSessionByOwner, Principal.compare, msg.caller, token);
    #ok({ token; expiresAt })
  };

  /// Revoke the caller's voice-agent session (e.g. on logout).
  public shared(msg) func revokeAgentSession() : async () {
    if (Principal.isAnonymous(msg.caller)) return;
    dropAgentSession(msg.caller);
  };

  // ─── Notification contact ───────────────────────────────────────────────────

  /// Allow a principal (the notification relay's identity) to look up emails.
  public shared(msg) func addNotifier(p: Principal) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    if (not isNotifier(p)) {
      notifierEntries := Array.concat(notifierEntries, [p]);
    };
    #ok(())
  };

  public shared(msg) func removeNotifier(p: Principal) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    notifierEntries := Array.filter<Principal>(notifierEntries, func (n) { n != p });
    #ok(())
  };

  /// The email address a user registered with, so the relay can send the
  /// notification emails they opted into. Notifiers and admins only; null for
  /// an unknown principal, an inactive account or an empty address.
  public query(msg) func getNotificationContact(p: Principal) : async Result.Result<?{ email : Text }, Error> {
    if (not isNotifier(msg.caller) and not isAdmin(msg.caller)) return #err(#NotAuthorized);
    switch (Map.get(users, Principal.compare, p)) {
      case (?u) {
        if (not u.isActive or Text.size(u.email) == 0) #ok(null) else #ok(?{ email = u.email })
      };
      case null #ok(null);
    }
  };

  /// The principal a live session token belongs to, or null if the token is
  /// unknown or expired. The token itself is the secret, so this is public.
  public query func resolveAgentSession(token : Text) : async ?Principal {
    switch (Map.get(agentSessions, Text.compare, token)) {
      case (?s) { if (s.expiresAt > Time.now()) ?s.owner else null };
      case null null;
    }
  };

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
      errorsByMethod = Iter.toArray(Map.entries(errsByMethod));
    }
  };
}
