/// #719 home warranty plan and claims, #722 mortgage details: types and
/// validation for the property canister. Pure functions, no state.
/// HomeGentic records what the owner enters; it checks nothing with the
/// warranty company or the lender.
import Insurance "Insurance";
import HouseGuide "HouseGuide";

module {
  // ─── Home warranty plan (#719) ──────────────────────────────────────────

  /// A whole-home warranty plan (service contract), as the owner reads it off
  /// the contract. Dates "YYYY-MM-DD"; `startDate` may be "". `contractDocId`
  /// is the contract in the home's document vault.
  public type PlanInput = {
    provider        : Text;
    planName        : Text;
    contractNumber  : Text;
    claimContact    : Text;
    serviceFeeCents : ?Nat;
    startDate       : Text;
    renewalDate     : Text;
    coverageNotes   : Text;
    exclusionNotes  : Text;
    contractDocId   : ?Text;
  };

  public type Plan = {
    provider        : Text;
    planName        : Text;
    contractNumber  : Text;
    claimContact    : Text;
    serviceFeeCents : ?Nat;
    startDate       : Text;
    renewalDate     : Text;
    coverageNotes   : Text;
    exclusionNotes  : Text;
    contractDocId   : ?Text;
    updatedAt       : Int;
  };

  public type ClaimOutcome = { #Open; #Approved; #PartlyApproved; #Denied; #Withdrawn };

  /// A service request filed with the home warranty company. `jobId` is the
  /// job on record for the visit or repair.
  public type ClaimInput = {
    dateFiled           : Text;
    issue               : Text;
    claimNumber         : Text;
    jobId               : ?Text;
    serviceFeePaidCents : ?Nat;
    outcome             : ClaimOutcome;
    outcomeNotes        : Text;
  };

  public type Claim = {
    id                  : Text;
    propertyId          : Text;
    dateFiled           : Text;
    issue               : Text;
    claimNumber         : Text;
    jobId               : ?Text;
    serviceFeePaidCents : ?Nat;
    outcome             : ClaimOutcome;
    outcomeNotes        : Text;
    createdAt           : Int;
    updatedAt           : Int;
  };

  public let MAX_CLAIMS_PER_PROPERTY : Nat = 100;
  /// Most a service-call fee may be: $1,000.
  public let MAX_SERVICE_FEE_CENTS : Nat = 100_000;

  let trim = Insurance.trim;

  func optDate(d : Text) : Bool { d == "" or Insurance.isDateFrom(d, 1990) };

  func badRef(r : ?Text) : Bool {
    switch r { case (?id) not HouseGuide.isRefId(id); case null false }
  };

  func feeTooHigh(f : ?Nat) : Bool {
    switch f { case (?c) c > MAX_SERVICE_FEE_CENTS; case null false }
  };

  public func cleanPlan(p : PlanInput) : PlanInput {
    {
      p with
      provider       = trim(p.provider);
      planName       = trim(p.planName);
      contractNumber = trim(p.contractNumber);
      claimContact   = trim(p.claimContact);
      coverageNotes  = trim(p.coverageNotes);
      exclusionNotes = trim(p.exclusionNotes);
    }
  };

  /// The problem with a (cleaned) plan, or null.
  public func validatePlan(p : PlanInput) : ?Text {
    if (p.provider.size() == 0)        return ?"Enter the home warranty company";
    if (p.provider.size() > 100)       return ?"Company name is over 100 characters";
    if (p.planName.size() > 100)       return ?"Plan name is over 100 characters";
    if (p.contractNumber.size() > 60)  return ?"Contract number is over 60 characters";
    if (p.claimContact.size() > 200)   return ?"Claim contact is over 200 characters";
    if (feeTooHigh(p.serviceFeeCents)) return ?"Service fee is over $1,000";
    if (not optDate(p.startDate))      return ?"Start date must be a real date written YYYY-MM-DD";
    if (p.renewalDate == "" or not optDate(p.renewalDate))
      return ?"Renewal date must be a real date written YYYY-MM-DD";
    if (p.startDate != "" and p.startDate > p.renewalDate) return ?"The start date is after the renewal date";
    if (p.coverageNotes.size() > 2000)  return ?"Coverage notes are over 2,000 characters";
    if (p.exclusionNotes.size() > 2000) return ?"Exclusion notes are over 2,000 characters";
    if (badRef(p.contractDocId))        return ?"That document doesn't exist";
    null
  };

  public func toPlan(p : PlanInput, now : Int) : Plan {
    {
      provider = p.provider; planName = p.planName; contractNumber = p.contractNumber;
      claimContact = p.claimContact; serviceFeeCents = p.serviceFeeCents; startDate = p.startDate;
      renewalDate = p.renewalDate; coverageNotes = p.coverageNotes; exclusionNotes = p.exclusionNotes;
      contractDocId = p.contractDocId; updatedAt = now;
    }
  };

  public func cleanClaim(c : ClaimInput) : ClaimInput {
    { c with issue = trim(c.issue); claimNumber = trim(c.claimNumber); outcomeNotes = trim(c.outcomeNotes) }
  };

  /// The problem with a (cleaned) claim, or null. The job id is checked for
  /// shape only: the job lives in the job canister.
  public func validateClaim(c : ClaimInput) : ?Text {
    if (c.issue.size() == 0)               return ?"Say what the claim is for";
    if (c.issue.size() > 120)              return ?"Issue is over 120 characters";
    if (c.dateFiled == "" or not optDate(c.dateFiled))
      return ?"Date filed must be a real date written YYYY-MM-DD";
    if (c.claimNumber.size() > 60)         return ?"Claim number is over 60 characters";
    if (feeTooHigh(c.serviceFeePaidCents)) return ?"Service fee is over $1,000";
    if (c.outcomeNotes.size() > 1000)      return ?"Outcome notes are over 1,000 characters";
    if (badRef(c.jobId))                   return ?"That job doesn't exist";
    null
  };

  // ─── Mortgage details (#722) ────────────────────────────────────────────

  /// The owner's own loan numbers. The rate is in thousandths of a percent
  /// (6.125% = 6125). `statementBalanceCents` and `statementDate` go together.
  public type LoanInput = {
    lender                : Text;
    originalAmountCents   : Nat;
    rateThousandthsPct    : Nat;
    termMonths            : Nat;
    firstPaymentDate      : Text;
    originalValueCents    : ?Nat;
    currentValueCents     : ?Nat;
    monthlyPmiCents       : ?Nat;
    monthlyEscrowCents    : ?Nat;
    statementBalanceCents : ?Nat;
    statementDate         : Text;
  };

  public type Loan = {
    lender                : Text;
    originalAmountCents   : Nat;
    rateThousandthsPct    : Nat;
    termMonths            : Nat;
    firstPaymentDate      : Text;
    originalValueCents    : ?Nat;
    currentValueCents     : ?Nat;
    monthlyPmiCents       : ?Nat;
    monthlyEscrowCents    : ?Nat;
    statementBalanceCents : ?Nat;
    statementDate         : Text;
    updatedAt             : Int;
  };

  /// $100,000,000: most a loan or a home value may be.
  public let MAX_AMOUNT_CENTS : Nat = 10_000_000_000;
  /// $100,000: most a monthly PMI or escrow amount may be.
  public let MAX_MONTHLY_CENTS : Nat = 10_000_000;

  func outOfRange(v : ?Nat, max : Nat) : Bool {
    switch v { case (?c) c == 0 or c > max; case null false }
  };

  func overMax(v : ?Nat, max : Nat) : Bool {
    switch v { case (?c) c > max; case null false }
  };

  public func cleanLoan(l : LoanInput) : LoanInput { { l with lender = trim(l.lender) } };

  /// The problem with a (cleaned) loan, or null.
  public func validateLoan(l : LoanInput) : ?Text {
    if (l.lender.size() > 100) return ?"Lender name is over 100 characters";
    if (l.originalAmountCents == 0) return ?"Enter the amount borrowed";
    if (l.originalAmountCents > MAX_AMOUNT_CENTS) return ?"Amount borrowed is over $100,000,000";
    if (l.rateThousandthsPct > 30_000) return ?"Interest rate is over 30%";
    if (l.termMonths < 12 or l.termMonths > 480) return ?"Loan term must be 1 to 40 years";
    if (not Insurance.isDateFrom(l.firstPaymentDate, 1950))
      return ?"First payment date must be a real date written YYYY-MM-DD";
    if (outOfRange(l.originalValueCents, MAX_AMOUNT_CENTS)) return ?"Original home value must be $0.01 to $100,000,000";
    if (outOfRange(l.currentValueCents, MAX_AMOUNT_CENTS))  return ?"Current home value must be $0.01 to $100,000,000";
    if (overMax(l.monthlyPmiCents, MAX_MONTHLY_CENTS))    return ?"Monthly PMI is over $100,000";
    if (overMax(l.monthlyEscrowCents, MAX_MONTHLY_CENTS)) return ?"Monthly escrow is over $100,000";
    switch (l.statementBalanceCents, l.statementDate) {
      case (null, "") {};
      case (?b, d) {
        if (not Insurance.isDateFrom(d, 1950)) return ?"Statement date must be a real date written YYYY-MM-DD";
        if (b > l.originalAmountCents) return ?"Statement balance is more than the amount borrowed";
      };
      case (null, _) return ?"Enter the statement balance with its date";
    };
    null
  };

  public func toLoan(l : LoanInput, now : Int) : Loan {
    {
      lender = l.lender; originalAmountCents = l.originalAmountCents; rateThousandthsPct = l.rateThousandthsPct;
      termMonths = l.termMonths; firstPaymentDate = l.firstPaymentDate; originalValueCents = l.originalValueCents;
      currentValueCents = l.currentValueCents; monthlyPmiCents = l.monthlyPmiCents;
      monthlyEscrowCents = l.monthlyEscrowCents; statementBalanceCents = l.statementBalanceCents;
      statementDate = l.statementDate; updatedAt = now;
    }
  };

  // ─── Home Pulse (#719, #722) ────────────────────────────────────────────

  public type PulseWarranty = { provider : Text; renewalDate : Text };

  /// What the weekly email's PMI reminder needs: the terms, not the lender,
  /// balances or current value.
  public type PulseLoan = {
    originalAmountCents : Nat;
    rateThousandthsPct  : Nat;
    termMonths          : Nat;
    firstPaymentDate    : Text;
    originalValueCents  : ?Nat;
    monthlyPmiCents     : ?Nat;
  };

  public type PulseHomeFinance = {
    propertyId : Text;
    warranty   : ?PulseWarranty;
    loan       : ?PulseLoan;
  };

  public func pulseLoan(l : Loan) : PulseLoan {
    {
      originalAmountCents = l.originalAmountCents; rateThousandthsPct = l.rateThousandthsPct;
      termMonths = l.termMonths; firstPaymentDate = l.firstPaymentDate;
      originalValueCents = l.originalValueCents; monthlyPmiCents = l.monthlyPmiCents;
    }
  };
};
