/// Interfaces of the canisters that other canisters call, declared once.
///
/// Motoko actor types are structural, so these are the same types the call
/// sites used to spell out inline; moving them here changes no stable type.
/// Only methods called from more than one canister live here. A one-off call
/// keeps its type next to the call.

import Debug     "mo:core/Debug";
import Principal "mo:core/Principal";
import Errors "Errors";

module {
  /// Subscription tier, as `payment` returns it.
  public type Tier = { #Free; #Pro; #ContractorFree; #ContractorPro };

  public type Payment = actor {
    getTierForPrincipal : shared query Principal -> async Tier;
  };

  public func payment(id : Text) : Payment = actor (id);

  /// A principal's role on a property, as `property.getAccessRole` returns it.
  public type AccessRole = { #Owner; #CoOwner; #Manager; #Viewer; #NoAccess };

  /// The property canister's ownership and access checks.
  public type Property = actor {
    isAuthorized         : shared query (Text, Principal, Bool) -> async Bool;
    getAccessRoles       : shared query ([Text], Principal) -> async [?AccessRole];
    getPropertyOwner     : shared query Text -> async ?Principal;
    getVerificationLevel : shared query Text -> async ?Text;
  };

  public func property(id : Text) : Property = actor (id);

  /// The `#Unavailable` text for a callee that rejected the call (stopped for an
  /// upgrade, out of cycles, trapped). Callers retry, so it says so.
  public func unavailable(service : Text) : Text {
    "The " # service # " service didn't answer. Please try again in a minute."
  };

  /// `property.isAuthorized` as a result: `#NotAuthorized` when the property
  /// canister says no, `#Unavailable` when it didn't answer (a rejected call
  /// would otherwise reach the client as an opaque reject; multi-canister
  /// skill, pitfall 7).
  public func authorize(propCanisterId : Text, propertyId : Text, caller : Principal, requireWrite : Bool) : async* { #ok : (); #err : Errors.Common } {
    try {
      if (await property(propCanisterId).isAuthorized(propertyId, caller, requireWrite)) #ok(()) else #err(#NotAuthorized)
    } catch _ { #err(#Unavailable(unavailable("property"))) }
  };

  /// `property.getPropertyOwner`, with a rejected call as `#Unavailable`.
  public func ownerOf(propCanisterId : Text, propertyId : Text) : async* { #ok : ?Principal; #err : Errors.Common } {
    try { #ok(await property(propCanisterId).getPropertyOwner(propertyId)) }
    catch _ { #err(#Unavailable(unavailable("property"))) }
  };

  /// `property.getAccessRoles`, or no roles when the call is rejected, so a
  /// list read shows nothing rather than failing.
  public func accessRoles(propCanisterId : Text, propertyIds : [Text], caller : Principal) : async* [?AccessRole] {
    try { await property(propCanisterId).getAccessRoles(propertyIds, caller) } catch _ { [] }
  };

  /// `payment.getTierForPrincipal`, with a rejected call as `#Unavailable`.
  /// Callers decide the not-wired case themselves (most fail closed to Free).
  public func tierOf(payCanisterId : Text, p : Principal) : async* { #ok : Tier; #err : Errors.Common } {
    try { #ok(await payment(payCanisterId).getTierForPrincipal(p)) }
    catch _ { #err(#Unavailable(unavailable("payment"))) }
  };

  /// True for any role on the property, as `property.isAuthorized(_, _, false)` decides.
  public func hasRole(role : ?AccessRole) : Bool {
    switch role { case (?#Owner or ?#CoOwner or ?#Manager or ?#Viewer) true; case _ false }
  };

  public type FeeError = Errors.Common or { #AlreadyExists };

  /// A bid that carries the Contractor Free referral fee, as `fee` records it.
  public type ReferralBid = {
    quoteId     : Text;
    requestId   : Text;
    contractor  : Principal;
    homeowner   : Principal;
    propertyId  : Text;
    serviceType : Text;
    bidCents    : Nat;
    bidAt       : Int;
  };

  /// The referral-fee calls `quote` and `job` make. Results name only the
  /// fee's id; Candid drops the fields left out.
  public type Fee = actor {
    referralBidAllowed       : shared query Principal -> async { #ok; #needsCard; #overdue };
    recordReferralBid        : shared ReferralBid -> async { #ok : (); #err : FeeError };
    recordReferralAccepted   : shared Text -> async { #ok : ?{ id : Text }; #err : FeeError };
    recordReferralJobVerified : shared (Text, Principal, Text, Text) -> async { #ok : ?{ id : Text }; #err : FeeError };
  };

  public func fee(id : Text) : Fee = actor (id);

  public type Audit = actor {
    log : shared (Text, Text, ?Principal, Text) -> async { #ok : Nat; #err : Errors.Common };
  };

  /// Writes one entry to the audit canister, fire-and-forget: does nothing when
  /// `audit` isn't wired, and a failed call is printed, never thrown, so an
  /// audit outage can't block the admin action being logged.
  public func auditLog(audit : ?Principal, source : Text, action : Text, subject : ?Principal, detail : Text) : async* () {
    switch (audit) {
      case null {};
      case (?id) {
        let a : Audit = actor (id.toText());
        try { ignore await a.log(source, action, subject, detail) } catch _ { Debug.print("[" # source # "] fire-and-forget call failed") };
      };
    };
  };
};
