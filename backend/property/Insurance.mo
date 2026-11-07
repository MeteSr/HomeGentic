/// #711: insurance helpers for the property canister: calendar-date checks
/// and the claim kit's types and validation. Pure functions, no state.
import Char "mo:core/Char";
import Nat "mo:core/Nat";
import Nat32 "mo:core/Nat32";
import Text "mo:core/Text";

module {
  public type ClaimStatus = { #Open; #Closed };

  /// What the household enters for a claim. `dateOfLoss` is "YYYY-MM-DD".
  public type ClaimInput = {
    title           : Text;
    dateOfLoss      : Text;
    cause           : Text;
    description     : Text;
    claimNumber     : Text;
    adjusterName    : Text;
    adjusterContact : Text;
    status          : ClaimStatus;
  };

  /// One dated line in a claim's log: a call, a visit, a payment, a letter.
  public type ClaimLogEntry = {
    date    : Text;   // "YYYY-MM-DD", the day it happened
    note    : Text;
    addedAt : Int;    // when it was written down
  };

  /// The household's own record of an insurance claim on the home. Nothing
  /// here is sent to, or checked with, the insurer.
  public type InsuranceClaim = {
    id              : Text;
    propertyId      : Text;
    title           : Text;
    dateOfLoss      : Text;
    cause           : Text;
    description     : Text;
    claimNumber     : Text;
    adjusterName    : Text;
    adjusterContact : Text;
    status          : ClaimStatus;
    log             : [ClaimLogEntry];
    createdAt       : Int;
    updatedAt       : Int;
  };

  public let MAX_CLAIMS_PER_PROPERTY : Nat = 50;
  public let MAX_LOG_ENTRIES : Nat = 200;

  func digitsOf(chars : [Char], from : Nat, len : Nat) : ?Nat {
    var n = 0;
    for (i in Nat.range(from, from + len)) {
      let c = chars[i];
      if (c < '0' or c > '9') return null;
      n := n * 10 + (c.toNat32() - '0'.toNat32()).toNat();
    };
    ?n
  };

  /// True for a real calendar date written "YYYY-MM-DD", years 2000–2100.
  public func isIsoDate(t : Text) : Bool { isDateFrom(t, 2000) };

  /// True for a real calendar date written "YYYY-MM-DD", years fromYear–2100.
  public func isDateFrom(t : Text, fromYear : Nat) : Bool {
    let chars = t.toArray();
    if (chars.size() != 10 or chars[4] != '-' or chars[7] != '-') return false;
    switch (digitsOf(chars, 0, 4), digitsOf(chars, 5, 2), digitsOf(chars, 8, 2)) {
      case (?y, ?m, ?d) {
        if (y < fromYear or y > 2100 or m < 1 or m > 12 or d < 1) return false;
        let leap = (y % 4 == 0 and y % 100 != 0) or y % 400 == 0;
        let days = switch m {
          case 2 { if leap 29 else 28 };
          case (4 or 6 or 9 or 11) { 30 };
          case _ { 31 };
        };
        d <= days
      };
      case _ false;
    }
  };

  public func trim(t : Text) : Text { t.trim(#predicate(Char.isWhitespace)) };

  /// The input with its text trimmed.
  public func clean(c : ClaimInput) : ClaimInput {
    {
      c with
      title           = trim(c.title);
      cause           = trim(c.cause);
      description     = trim(c.description);
      claimNumber     = trim(c.claimNumber);
      adjusterName    = trim(c.adjusterName);
      adjusterContact = trim(c.adjusterContact);
    }
  };

  /// The problem with a (cleaned) claim, or null.
  public func validateClaim(c : ClaimInput) : ?Text {
    if (c.title.size() == 0)             return ?"Give the claim a short title";
    if (c.title.size() > 100)            return ?"Title is over 100 characters";
    if (not isIsoDate(c.dateOfLoss))     return ?"Date of loss must be a real date written YYYY-MM-DD";
    if (c.cause.size() > 60)             return ?"Cause is over 60 characters";
    if (c.description.size() > 2000)     return ?"Description is over 2,000 characters";
    if (c.claimNumber.size() > 60)       return ?"Claim number is over 60 characters";
    if (c.adjusterName.size() > 100)     return ?"Adjuster name is over 100 characters";
    if (c.adjusterContact.size() > 200)  return ?"Adjuster contact is over 200 characters";
    null
  };

  /// The problem with a (trimmed) log entry, or null.
  public func validateLogEntry(date : Text, note : Text) : ?Text {
    if (not isIsoDate(date)) return ?"Log date must be a real date written YYYY-MM-DD";
    if (note.size() == 0)    return ?"Write what happened";
    if (note.size() > 1000)  return ?"Log note is over 1,000 characters";
    null
  };

  // ─── Contents inventory ─────────────────────────────────────────────────

  /// What the household enters for one thing in the home. `valueCents` is the
  /// owner's estimate of what one would cost to replace; `purchaseDate` is
  /// "YYYY-MM-DD" or "".
  public type InventoryItemInput = {
    roomId       : ?Text;
    name         : Text;
    category     : Text;
    quantity     : Nat;
    valueCents   : ?Nat;
    purchaseDate : Text;
    serialNumber : Text;
    notes        : Text;
  };

  public type InventoryItem = {
    id           : Text;
    propertyId   : Text;
    roomId       : ?Text;
    name         : Text;
    category     : Text;
    quantity     : Nat;
    valueCents   : ?Nat;
    purchaseDate : Text;
    serialNumber : Text;
    notes        : Text;
    createdAt    : Int;
    updatedAt    : Int;
  };

  public let MAX_INVENTORY_ITEMS : Nat = 500;
  /// Most an item's value may be: $100,000,000.
  public let MAX_VALUE_CENTS : Nat = 10_000_000_000;

  public func cleanItem(i : InventoryItemInput) : InventoryItemInput {
    {
      i with
      name         = trim(i.name);
      category     = trim(i.category);
      serialNumber = trim(i.serialNumber);
      notes        = trim(i.notes);
    }
  };

  /// The problem with a (cleaned) item, or null. The room is checked by the caller.
  public func validateItem(i : InventoryItemInput) : ?Text {
    if (i.name.size() == 0)           return ?"Name the item";
    if (i.name.size() > 100)          return ?"Name is over 100 characters";
    if (i.category.size() > 40)       return ?"Category is over 40 characters";
    if (i.quantity < 1 or i.quantity > 999) return ?"Quantity must be 1 to 999";
    switch (i.valueCents) {
      case (?v) { if (v > MAX_VALUE_CENTS) return ?"Value is over $100,000,000" };
      case null {};
    };
    if (i.purchaseDate != "" and not isDateFrom(i.purchaseDate, 1900))
      return ?"Purchase date must be a real date written YYYY-MM-DD";
    if (i.serialNumber.size() > 100)  return ?"Serial number is over 100 characters";
    if (i.notes.size() > 500)         return ?"Notes are over 500 characters";
    null
  };
};
