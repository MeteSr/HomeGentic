/// #726: condo and HOA paperwork the household keeps: architectural review
/// requests, special assessments and, for condos, the association's
/// milestone inspection and reserve study dates. Types and validation only.
/// HomeGentic records what the owner enters; it checks nothing with the
/// association.
import Insurance "Insurance";
import HouseGuide "HouseGuide";

module {
  public type ReviewStatus = {
    #Planned;
    #Submitted;
    #Approved;
    #ApprovedWithConditions;
    #Denied;
    #Withdrawn;
  };

  /// An architectural review (ARC) request to the association. Dates are
  /// "YYYY-MM-DD" or "". `approvalDocId` is a document in the home's vault;
  /// `jobId` the job for the approved work.
  public type ReviewInput = {
    project       : Text;
    details       : Text;
    submittedDate : Text;
    status        : ReviewStatus;
    decisionDate  : Text;
    conditions    : Text;
    approvalDocId : ?Text;
    jobId         : ?Text;
  };

  public type ArchitecturalReview = {
    id            : Text;
    propertyId    : Text;
    project       : Text;
    details       : Text;
    submittedDate : Text;
    status        : ReviewStatus;
    decisionDate  : Text;
    conditions    : Text;
    approvalDocId : ?Text;
    jobId         : ?Text;
    createdAt     : Int;
    updatedAt     : Int;
  };

  /// A special assessment the association levied on the unit: a dated cost.
  public type AssessmentInput = {
    title       : Text;
    amountCents : Nat;
    dueDate     : Text;   // "YYYY-MM-DD"
    paidDate    : Text;   // "YYYY-MM-DD" or "" while unpaid
    notes       : Text;
    documentId  : ?Text;
  };

  public type SpecialAssessment = {
    id          : Text;
    propertyId  : Text;
    title       : Text;
    amountCents : Nat;
    dueDate     : Text;
    paidDate    : Text;
    notes       : Text;
    documentId  : ?Text;
    createdAt   : Int;
    updatedAt   : Int;
  };

  /// Condo only: what the owner knows of the association's milestone
  /// inspection and structural reserve study. Dates "YYYY-MM-DD" or "".
  public type CondoRecordInput = {
    associationName      : Text;
    milestoneLastDate    : Text;
    milestoneNextDue     : Text;
    milestoneDocId       : ?Text;
    reserveStudyLastDate : Text;
    reserveStudyNextDue  : Text;
    reserveStudyDocId    : ?Text;
    notes                : Text;
  };

  public type CondoRecord = {
    associationName      : Text;
    milestoneLastDate    : Text;
    milestoneNextDue     : Text;
    milestoneDocId       : ?Text;
    reserveStudyLastDate : Text;
    reserveStudyNextDue  : Text;
    reserveStudyDocId    : ?Text;
    notes                : Text;
    updatedAt            : Int;
  };

  public let MAX_REVIEWS_PER_PROPERTY : Nat = 100;
  public let MAX_ASSESSMENTS_PER_PROPERTY : Nat = 100;
  /// Most an assessment may be: $100,000,000.
  public let MAX_AMOUNT_CENTS : Nat = 10_000_000_000;

  let trim = Insurance.trim;

  func optDate(d : Text) : Bool { d == "" or Insurance.isDateFrom(d, 1950) };

  func badRef(r : ?Text) : Bool {
    switch r { case (?id) not HouseGuide.isRefId(id); case null false }
  };

  public func cleanReview(r : ReviewInput) : ReviewInput {
    { r with project = trim(r.project); details = trim(r.details); conditions = trim(r.conditions) }
  };

  /// The problem with a (cleaned) review request, or null.
  public func validateReview(r : ReviewInput) : ?Text {
    if (r.project.size() == 0)       return ?"Say what the request is for";
    if (r.project.size() > 120)      return ?"Project is over 120 characters";
    if (r.details.size() > 2000)     return ?"Details are over 2,000 characters";
    if (r.conditions.size() > 1000)  return ?"Conditions are over 1,000 characters";
    if (not optDate(r.submittedDate)) return ?"Submitted date must be a real date written YYYY-MM-DD";
    if (not optDate(r.decisionDate))  return ?"Decision date must be a real date written YYYY-MM-DD";
    let decided = switch (r.status) {
      case (#Approved or #ApprovedWithConditions or #Denied) true;
      case _ false;
    };
    let sent = switch (r.status) { case (#Planned or #Withdrawn) false; case _ true };
    if (sent and r.submittedDate == "") return ?"Enter the date you submitted the request";
    if (decided and r.decisionDate == "") return ?"Enter the date of the association's decision";
    if (r.submittedDate != "" and r.decisionDate != "" and r.decisionDate < r.submittedDate)
      return ?"The decision date is before the submitted date";
    if (badRef(r.approvalDocId)) return ?"That document doesn't exist";
    if (badRef(r.jobId))         return ?"That job doesn't exist";
    null
  };

  public func cleanAssessment(a : AssessmentInput) : AssessmentInput {
    { a with title = trim(a.title); notes = trim(a.notes) }
  };

  /// The problem with a (cleaned) special assessment, or null.
  public func validateAssessment(a : AssessmentInput) : ?Text {
    if (a.title.size() == 0)    return ?"Say what the assessment is for";
    if (a.title.size() > 120)   return ?"Title is over 120 characters";
    if (a.amountCents == 0)     return ?"Enter the amount";
    if (a.amountCents > MAX_AMOUNT_CENTS) return ?"Amount is over $100,000,000";
    if (a.dueDate == "" or not optDate(a.dueDate)) return ?"Due date must be a real date written YYYY-MM-DD";
    if (not optDate(a.paidDate)) return ?"Paid date must be a real date written YYYY-MM-DD";
    if (a.notes.size() > 1000)  return ?"Notes are over 1,000 characters";
    if (badRef(a.documentId))   return ?"That document doesn't exist";
    null
  };

  public func cleanCondo(c : CondoRecordInput) : CondoRecordInput {
    { c with associationName = trim(c.associationName); notes = trim(c.notes) }
  };

  /// The problem with a (cleaned) condo association record, or null.
  public func validateCondo(c : CondoRecordInput) : ?Text {
    if (c.associationName.size() > 120) return ?"Association name is over 120 characters";
    if (not optDate(c.milestoneLastDate))    return ?"Milestone inspection date must be a real date written YYYY-MM-DD";
    if (not optDate(c.milestoneNextDue))     return ?"Next milestone inspection date must be a real date written YYYY-MM-DD";
    if (not optDate(c.reserveStudyLastDate)) return ?"Reserve study date must be a real date written YYYY-MM-DD";
    if (not optDate(c.reserveStudyNextDue))  return ?"Next reserve study date must be a real date written YYYY-MM-DD";
    if (badRef(c.milestoneDocId) or badRef(c.reserveStudyDocId)) return ?"That document doesn't exist";
    if (c.notes.size() > 2000) return ?"Notes are over 2,000 characters";
    null
  };
};
