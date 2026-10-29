/// Interfaces of the canisters that other canisters call, declared once.
///
/// Motoko actor types are structural, so these are the same types the call
/// sites used to spell out inline; moving them here changes no stable type.
/// Only methods called from more than one canister live here. A one-off call
/// keeps its type next to the call.

import Debug     "mo:core/Debug";
import Principal "mo:core/Principal";

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

  /// True for any role on the property, as `property.isAuthorized(_, _, false)` decides.
  public func hasRole(role : ?AccessRole) : Bool {
    switch role { case (?#Owner or ?#CoOwner or ?#Manager or ?#Viewer) true; case _ false }
  };

  public type FeeError = { #NotFound; #NotAuthorized; #AlreadyExists; #InvalidInput : Text };

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
    log : shared (Text, Text, ?Principal, Text) -> async { #ok : Nat; #err : { #NotAuthorized; #InvalidInput : Text } };
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
