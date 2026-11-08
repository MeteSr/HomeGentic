/// #724: the successor (legacy contact) an owner names for a home record, and
/// the claims a successor opens when the owner has died or the home has gone
/// to a trust or heir.
///
/// Rules (decided 2026-11-08): the successor proves it with a document (death
/// certificate, letters of administration or testamentary, or trust papers)
/// that a HomeGentic admin reviews; the record moves only once the claim is
/// approved and WAIT_NS has passed since it was opened, and the owner or a
/// co-owner can cancel it until then. HomeGentic passes on the record only;
/// it doesn't transfer the property or act in any estate matter.
///
/// Types, validation and pure state changes only, no state.
import Blob "mo:core/Blob";
import Char "mo:core/Char";
import Iter "mo:core/Iter";
import Text "mo:core/Text";
import Insurance "Insurance";

module {
  public type SuccessorInput = {
    name         : Text;
    email        : Text;
    relationship : Text;   // "Daughter", "Trustee"; may be empty
  };

  /// `token` is the successor link's credential: whoever holds it can open a
  /// claim (which still needs proof, review and the wait). Only the owner
  /// reads it.
  public type Successor = {
    name         : Text;
    email        : Text;
    relationship : Text;
    token        : Text;
    namedAt      : Int;
  };

  public type ProofKind = {
    #DeathCertificate;
    #LettersOfAdministration;
    #LettersTestamentary;
    #TrustDocument;
  };

  public type ClaimInput = {
    claimantName : Text;
    proofKind    : ProofKind;
    fileName     : Text;
    mimeType     : Text;
    note         : Text;
  };

  public type ClaimStatus = {
    #AwaitingReview;
    #Approved  : { at : Int };
    #Rejected  : { at : Int; reason : Text };
    #Cancelled : { at : Int; by : Principal };
    #Completed : { at : Int };
  };

  public type Claim = {
    id           : Text;
    propertyId   : Text;
    claimant     : Principal;
    claimantName : Text;
    proofKind    : ProofKind;
    fileName     : Text;
    mimeType     : Text;
    proofSize    : Nat;
    note         : Text;
    openedAt     : Int;
    waitEndsAt   : Int;
    status       : ClaimStatus;
  };

  /// The proof file, held only while the claim is open.
  public type Proof = {
    fileName : Text;
    mimeType : Text;
    data     : Blob;
  };

  public let WAIT_DAYS : Nat = 30;
  public let WAIT_NS : Int = 2_592_000_000_000_000;   // 30 days
  /// Largest proof file. The whole call must fit the IC's 2 MiB ingress limit.
  public let MAX_PROOF_BYTES : Nat = 1_800_000;
  /// Claims kept per home (resolved ones included), so retries are bounded.
  public let MAX_CLAIMS_PER_PROPERTY : Nat = 10;

  public func trim(t : Text) : Text { Insurance.trim(t) };

  public func cleanSuccessor(s : SuccessorInput) : SuccessorInput {
    { name = trim(s.name); email = trim(s.email).toLower(); relationship = trim(s.relationship) }
  };

  /// The problem with a (cleaned) successor, or null.
  public func validateSuccessor(s : SuccessorInput) : ?Text {
    if (s.name.size() == 0)          return ?"Enter your successor's name";
    if (s.name.size() > 100)         return ?"Name is over 100 characters";
    if (s.email.size() > 254)        return ?"Email is over 254 characters";
    if (not isEmail(s.email))        return ?"Enter a valid email address";
    if (s.relationship.size() > 60)  return ?"Relationship is over 60 characters";
    null
  };

  /// One '@' with text on both sides, a '.' after it, and no spaces.
  public func isEmail(e : Text) : Bool {
    if (e.contains(#predicate(Char.isWhitespace))) return false;
    let parts = e.split(#char '@').toArray();
    if (parts.size() != 2) return false;
    parts[0].size() > 0 and parts[1].size() > 2 and parts[1].contains(#char '.')
  };

  public func cleanClaim(c : ClaimInput) : ClaimInput {
    { c with claimantName = trim(c.claimantName); fileName = trim(c.fileName); note = trim(c.note) }
  };

  /// The problem with a (cleaned) claim and its proof file, or null. The
  /// file's first bytes must match its type (PDF, JPEG or PNG).
  public func validateClaim(c : ClaimInput, proof : Blob) : ?Text {
    if (c.claimantName.size() == 0)  return ?"Enter your full name";
    if (c.claimantName.size() > 100) return ?"Name is over 100 characters";
    if (c.fileName.size() == 0)      return ?"Attach the document";
    if (c.fileName.size() > 200)     return ?"File name is over 200 characters";
    if (c.note.size() > 1000)        return ?"Note is over 1,000 characters";
    if (proof.size() == 0)           return ?"Attach the document";
    if (proof.size() > MAX_PROOF_BYTES) return ?"The document is over 1.8 MB; scan it at a lower resolution";
    if (not matchesType(c.mimeType, proof)) return ?"Attach a PDF, JPEG or PNG file";
    null
  };

  public func matchesType(mimeType : Text, data : Blob) : Bool {
    let b = data.toArray();
    let starts = func(sig : [Nat8]) : Bool {
      if (b.size() < sig.size()) return false;
      var i = 0;
      while (i < sig.size()) { if (b[i] != sig[i]) return false; i += 1 };
      true
    };
    switch mimeType {
      case "application/pdf" starts([0x25, 0x50, 0x44, 0x46]);
      case "image/jpeg"      starts([0xFF, 0xD8, 0xFF]);
      case "image/png"       starts([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
      case _ false;
    }
  };

  public func isOpen(c : Claim) : Bool {
    switch (c.status) {
      case (#AwaitingReview or #Approved _) true;
      case (#Rejected _ or #Cancelled _ or #Completed _) false;
    }
  };

  public func open(id : Text, propertyId : Text, claimant : Principal, c : ClaimInput, proofSize : Nat, now : Int) : Claim {
    {
      id;
      propertyId;
      claimant;
      claimantName = c.claimantName;
      proofKind    = c.proofKind;
      fileName     = c.fileName;
      mimeType     = c.mimeType;
      proofSize;
      note         = c.note;
      openedAt     = now;
      waitEndsAt   = now + WAIT_NS;
      status       = #AwaitingReview;
    }
  };

  /// Why the claimant can't finish the claim yet, or null when they can.
  public func blockToComplete(c : Claim, now : Int) : ?Text {
    switch (c.status) {
      case (#AwaitingReview) ?"HomeGentic hasn't reviewed your document yet";
      case (#Approved _) {
        if (now < c.waitEndsAt) ?"The 30-day waiting period isn't over yet" else null
      };
      case (#Rejected _)  ?"This claim was not approved";
      case (#Cancelled _) ?"This claim was cancelled";
      case (#Completed _) ?"This claim is already complete";
    }
  };
};
