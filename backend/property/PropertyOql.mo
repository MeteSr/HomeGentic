/// The property canister's OQL catalogue (see shared/Oql.mo): the household's
/// own records about each home. No principals and no identity-check details
/// are exposed, and the house guide is left out on purpose (it holds Wi-Fi
/// passwords and alarm codes, which don't belong in an assistant's context).
import Oql "../shared/Oql";

module {
  public let HOMES : Oql.Entity = {
    name = "homes";
    primaryKey = "id";
    description = "The caller's homes: address and basic facts, and the caller's role on each. Without an id condition, covers the homes the caller owns; to read a home the caller co-owns, manages or views, pin it with {\"eq\":{\"field\":\"id\",\"value\":\"...\"}} or \"in\" (at most 20 homes per query).";
    fields = [
      { name = "id"; typeName = #text; nullable = false; description = "Home id (the propertyId other entities use)" },
      { name = "address"; typeName = #text; nullable = false; description = "Street address" },
      { name = "city"; typeName = #text; nullable = false; description = "City" },
      { name = "state"; typeName = #text; nullable = false; description = "State, two letters" },
      { name = "zipCode"; typeName = #text; nullable = false; description = "ZIP code" },
      { name = "propertyType"; typeName = #text; nullable = false; description = "SingleFamily, Condo, Townhouse or MultiFamily" },
      { name = "yearBuilt"; typeName = #int; nullable = false; description = "Year the home was built" },
      { name = "squareFeet"; typeName = #int; nullable = false; description = "Living area in square feet" },
      { name = "verificationLevel"; typeName = #text; nullable = false; description = "Ownership check: Unverified, PendingReview, Basic or Premium" },
      { name = "myRole"; typeName = #text; nullable = false; description = "The caller's role on the home: Owner, CoOwner, Manager or Viewer" },
      { name = "active"; typeName = #bool; nullable = false; description = "False once the home has been removed from the account" },
    ];
  };

  public let ROOMS : Oql.Entity = {
    name = "rooms";
    primaryKey = "id";
    description = "Rooms recorded for each home, with floor and paint details. Without a propertyId condition, covers the homes the caller owns; to read a home the caller co-owns, manages or views, pin it with {\"eq\":{\"field\":\"propertyId\",\"value\":\"...\"}} or \"in\" (at most 20 homes per query).";
    fields = [
      { name = "id"; typeName = #text; nullable = false; description = "Room id" },
      { name = "propertyId"; typeName = #text; nullable = false; description = "The home" },
      { name = "name"; typeName = #text; nullable = false; description = "Room name" },
      { name = "floorName"; typeName = #text; nullable = false; description = "Floor or level, as entered" },
      { name = "floorType"; typeName = #text; nullable = false; description = "Flooring, as entered" },
      { name = "paintColor"; typeName = #text; nullable = false; description = "Paint color" },
      { name = "paintBrand"; typeName = #text; nullable = false; description = "Paint brand" },
      { name = "paintCode"; typeName = #text; nullable = false; description = "Paint code" },
      { name = "notes"; typeName = #text; nullable = false; description = "Notes" },
      { name = "fixtureCount"; typeName = #int; nullable = false; description = "How many fixtures and appliances are recorded in the room" },
    ];
  };

  public let FIXTURES : Oql.Entity = {
    name = "fixtures";
    primaryKey = "id";
    description = "Fixtures and appliances recorded in each room, with install and warranty dates. Without a propertyId condition, covers the homes the caller owns; to read a home the caller co-owns, manages or views, pin it with {\"eq\":{\"field\":\"propertyId\",\"value\":\"...\"}} or \"in\" (at most 20 homes per query).";
    fields = [
      { name = "id"; typeName = #text; nullable = false; description = "Fixture id" },
      { name = "propertyId"; typeName = #text; nullable = false; description = "The home" },
      { name = "roomId"; typeName = #text; nullable = false; description = "The room" },
      { name = "roomName"; typeName = #text; nullable = false; description = "The room's name" },
      { name = "brand"; typeName = #text; nullable = false; description = "Brand" },
      { name = "model"; typeName = #text; nullable = false; description = "Model" },
      { name = "serialNumber"; typeName = #text; nullable = false; description = "Serial number, as entered" },
      { name = "installedDate"; typeName = #text; nullable = true; description = "Installed, YYYY-MM-DD" },
      { name = "warrantyExpiry"; typeName = #text; nullable = true; description = "Warranty ends, YYYY-MM-DD" },
      { name = "notes"; typeName = #text; nullable = false; description = "Notes" },
    ];
  };

  public let INSURANCE_POLICIES : Oql.Entity = {
    name = "insurance_policies";
    primaryKey = "propertyId";
    description = "The household's own copy of each home's insurance policy details (not checked with the carrier). Without a propertyId condition, covers the homes the caller owns; to read a home the caller co-owns, manages or views, pin it with {\"eq\":{\"field\":\"propertyId\",\"value\":\"...\"}} or \"in\" (at most 20 homes per query).";
    fields = [
      { name = "propertyId"; typeName = #text; nullable = false; description = "The home" },
      { name = "carrier"; typeName = #text; nullable = false; description = "Insurance company" },
      { name = "policyNumber"; typeName = #text; nullable = false; description = "Policy number" },
      { name = "renewalDate"; typeName = #text; nullable = false; description = "Renewal date, YYYY-MM-DD" },
      { name = "coverageACents"; typeName = #int; nullable = true; description = "Dwelling coverage (Coverage A) in US cents" },
      { name = "hurricaneDeductiblePercent"; typeName = #int; nullable = true; description = "Hurricane deductible as a percent of Coverage A, when written that way" },
      { name = "hurricaneDeductibleCents"; typeName = #int; nullable = true; description = "Hurricane deductible in US cents, when written as an amount" },
      { name = "updatedDate"; typeName = #text; nullable = false; description = "Last changed, YYYY-MM-DD (UTC)" },
    ];
  };

  public let INSURANCE_CLAIMS : Oql.Entity = {
    name = "insurance_claims";
    primaryKey = "id";
    description = "Insurance claims the household is tracking for each home (a record, not a filing). Without a propertyId condition, covers the homes the caller owns; to read a home the caller co-owns, manages or views, pin it with {\"eq\":{\"field\":\"propertyId\",\"value\":\"...\"}} or \"in\" (at most 20 homes per query).";
    fields = [
      { name = "id"; typeName = #text; nullable = false; description = "Claim id" },
      { name = "propertyId"; typeName = #text; nullable = false; description = "The home" },
      { name = "title"; typeName = #text; nullable = false; description = "Short title" },
      { name = "dateOfLoss"; typeName = #text; nullable = false; description = "Date of loss, YYYY-MM-DD" },
      { name = "cause"; typeName = #text; nullable = false; description = "Cause, as entered" },
      { name = "description"; typeName = #text; nullable = false; description = "What happened" },
      { name = "claimNumber"; typeName = #text; nullable = false; description = "Carrier's claim number" },
      { name = "adjusterName"; typeName = #text; nullable = false; description = "Adjuster" },
      { name = "adjusterContact"; typeName = #text; nullable = false; description = "Adjuster's contact details" },
      { name = "status"; typeName = #text; nullable = false; description = "Open or Closed" },
      { name = "logEntries"; typeName = #int; nullable = false; description = "How many dated notes the claim log has" },
      { name = "lastLogDate"; typeName = #text; nullable = true; description = "Date of the latest log note, YYYY-MM-DD" },
    ];
  };

  public let INVENTORY : Oql.Entity = {
    name = "inventory_items";
    primaryKey = "id";
    description = "The home contents inventory kept for insurance. Without a propertyId condition, covers the homes the caller owns; to read a home the caller co-owns, manages or views, pin it with {\"eq\":{\"field\":\"propertyId\",\"value\":\"...\"}} or \"in\" (at most 20 homes per query).";
    fields = [
      { name = "id"; typeName = #text; nullable = false; description = "Item id" },
      { name = "propertyId"; typeName = #text; nullable = false; description = "The home" },
      { name = "roomId"; typeName = #text; nullable = true; description = "The room it is in" },
      { name = "name"; typeName = #text; nullable = false; description = "Item" },
      { name = "category"; typeName = #text; nullable = false; description = "Category, as entered" },
      { name = "quantity"; typeName = #int; nullable = false; description = "How many" },
      { name = "valueCents"; typeName = #int; nullable = true; description = "Value in US cents, for all of them" },
      { name = "purchaseDate"; typeName = #text; nullable = true; description = "Bought, YYYY-MM-DD" },
      { name = "serialNumber"; typeName = #text; nullable = false; description = "Serial number" },
      { name = "notes"; typeName = #text; nullable = false; description = "Notes" },
    ];
  };

  public let WARRANTY_PLANS : Oql.Entity = {
    name = "warranty_plans";
    primaryKey = "propertyId";
    description = "Each home's home warranty (service contract) plan, as the household recorded it. Without a propertyId condition, covers the homes the caller owns; to read a home the caller co-owns, manages or views, pin it with {\"eq\":{\"field\":\"propertyId\",\"value\":\"...\"}} or \"in\" (at most 20 homes per query).";
    fields = [
      { name = "propertyId"; typeName = #text; nullable = false; description = "The home" },
      { name = "provider"; typeName = #text; nullable = false; description = "Home warranty company" },
      { name = "planName"; typeName = #text; nullable = false; description = "Plan name" },
      { name = "contractNumber"; typeName = #text; nullable = false; description = "Contract number" },
      { name = "claimContact"; typeName = #text; nullable = false; description = "How to file a claim" },
      { name = "serviceFeeCents"; typeName = #int; nullable = true; description = "Service call fee in US cents" },
      { name = "startDate"; typeName = #text; nullable = true; description = "Start date, YYYY-MM-DD" },
      { name = "renewalDate"; typeName = #text; nullable = false; description = "Renewal date, YYYY-MM-DD" },
      { name = "coverageNotes"; typeName = #text; nullable = false; description = "What it covers, as entered" },
      { name = "exclusionNotes"; typeName = #text; nullable = false; description = "What it excludes, as entered" },
    ];
  };

  public let WARRANTY_CLAIMS : Oql.Entity = {
    name = "warranty_claims";
    primaryKey = "id";
    description = "Claims filed with the home warranty company. Without a propertyId condition, covers the homes the caller owns; to read a home the caller co-owns, manages or views, pin it with {\"eq\":{\"field\":\"propertyId\",\"value\":\"...\"}} or \"in\" (at most 20 homes per query).";
    fields = [
      { name = "id"; typeName = #text; nullable = false; description = "Claim id" },
      { name = "propertyId"; typeName = #text; nullable = false; description = "The home" },
      { name = "dateFiled"; typeName = #text; nullable = false; description = "Filed, YYYY-MM-DD" },
      { name = "issue"; typeName = #text; nullable = false; description = "What the claim was for" },
      { name = "claimNumber"; typeName = #text; nullable = false; description = "Company's claim number" },
      { name = "jobId"; typeName = #text; nullable = true; description = "The job record for the repair, if linked" },
      { name = "serviceFeePaidCents"; typeName = #int; nullable = true; description = "Service fee paid, in US cents" },
      { name = "outcome"; typeName = #text; nullable = false; description = "Open, Approved, PartlyApproved, Denied or Withdrawn" },
      { name = "outcomeNotes"; typeName = #text; nullable = false; description = "Notes on the outcome" },
    ];
  };

  public let MORTGAGES : Oql.Entity = {
    name = "mortgages";
    primaryKey = "propertyId";
    description = "Each home's mortgage details as the owner entered them (a calculator's inputs; nothing goes to the lender). Only the owner and co-owners see these rows. Without a propertyId condition, covers the homes the caller owns; to read a home the caller co-owns, manages or views, pin it with {\"eq\":{\"field\":\"propertyId\",\"value\":\"...\"}} or \"in\" (at most 20 homes per query).";
    fields = [
      { name = "propertyId"; typeName = #text; nullable = false; description = "The home" },
      { name = "lender"; typeName = #text; nullable = false; description = "Lender" },
      { name = "originalAmountCents"; typeName = #int; nullable = false; description = "Amount borrowed, US cents" },
      { name = "ratePercent"; typeName = #float; nullable = false; description = "Interest rate, percent a year (6.25 = 6.25%)" },
      { name = "termMonths"; typeName = #int; nullable = false; description = "Loan term in months" },
      { name = "firstPaymentDate"; typeName = #text; nullable = false; description = "First payment, YYYY-MM-DD" },
      { name = "originalValueCents"; typeName = #int; nullable = true; description = "Home value when the loan was made, US cents" },
      { name = "currentValueCents"; typeName = #int; nullable = true; description = "Home value now, as the owner estimates it, US cents" },
      { name = "monthlyPmiCents"; typeName = #int; nullable = true; description = "Monthly PMI, US cents" },
      { name = "monthlyEscrowCents"; typeName = #int; nullable = true; description = "Monthly escrow, US cents" },
      { name = "statementBalanceCents"; typeName = #int; nullable = true; description = "Balance on the latest statement, US cents" },
      { name = "statementDate"; typeName = #text; nullable = true; description = "Date of that statement, YYYY-MM-DD" },
    ];
  };

  public let TAX_YEARS : Oql.Entity = {
    name = "tax_years";
    primaryKey = "propertyId";
    description = "Property tax notices by year: values, homestead exemption status and petition deadline, as the owner entered them. Only the owner and co-owners see these rows. Without a propertyId condition, covers the homes the caller owns; to read a home the caller co-owns, manages or views, pin it with {\"eq\":{\"field\":\"propertyId\",\"value\":\"...\"}} or \"in\" (at most 20 homes per query).";
    fields = [
      { name = "propertyId"; typeName = #text; nullable = false; description = "The home" },
      { name = "year"; typeName = #int; nullable = false; description = "Tax year" },
      { name = "marketValueCents"; typeName = #int; nullable = true; description = "Just/market value, US cents" },
      { name = "assessedValueCents"; typeName = #int; nullable = true; description = "Assessed value, US cents" },
      { name = "taxableValueCents"; typeName = #int; nullable = true; description = "Taxable value, US cents" },
      { name = "exemption"; typeName = #text; nullable = false; description = "Homestead exemption: Unknown, NotApplying, Applied, Granted or Denied" },
      { name = "petitionDeadline"; typeName = #text; nullable = true; description = "Last day to petition the value, YYYY-MM-DD" },
      { name = "notes"; typeName = #text; nullable = false; description = "Notes" },
    ];
  };

  public let HOA_ASSESSMENTS : Oql.Entity = {
    name = "hoa_assessments";
    primaryKey = "id";
    description = "HOA or condo special assessments: dated costs and whether they're paid. Without a propertyId condition, covers the homes the caller owns; to read a home the caller co-owns, manages or views, pin it with {\"eq\":{\"field\":\"propertyId\",\"value\":\"...\"}} or \"in\" (at most 20 homes per query).";
    fields = [
      { name = "id"; typeName = #text; nullable = false; description = "Assessment id" },
      { name = "propertyId"; typeName = #text; nullable = false; description = "The home" },
      { name = "title"; typeName = #text; nullable = false; description = "What it is for" },
      { name = "amountCents"; typeName = #int; nullable = false; description = "Amount, US cents" },
      { name = "dueDate"; typeName = #text; nullable = false; description = "Due, YYYY-MM-DD" },
      { name = "paidDate"; typeName = #text; nullable = true; description = "Paid, YYYY-MM-DD; null while unpaid" },
      { name = "paid"; typeName = #bool; nullable = false; description = "True once paid" },
      { name = "notes"; typeName = #text; nullable = false; description = "Notes" },
    ];
  };

  public let HOA_REVIEWS : Oql.Entity = {
    name = "hoa_reviews";
    primaryKey = "id";
    description = "Architectural review requests to the HOA (approval to change the outside of the home). Without a propertyId condition, covers the homes the caller owns; to read a home the caller co-owns, manages or views, pin it with {\"eq\":{\"field\":\"propertyId\",\"value\":\"...\"}} or \"in\" (at most 20 homes per query).";
    fields = [
      { name = "id"; typeName = #text; nullable = false; description = "Request id" },
      { name = "propertyId"; typeName = #text; nullable = false; description = "The home" },
      { name = "project"; typeName = #text; nullable = false; description = "What the request is for" },
      { name = "details"; typeName = #text; nullable = false; description = "Details" },
      { name = "submittedDate"; typeName = #text; nullable = true; description = "Submitted, YYYY-MM-DD" },
      { name = "status"; typeName = #text; nullable = false; description = "Planned, Submitted, Approved, ApprovedWithConditions, Denied or Withdrawn" },
      { name = "decisionDate"; typeName = #text; nullable = true; description = "Decided, YYYY-MM-DD" },
      { name = "conditions"; typeName = #text; nullable = false; description = "Conditions attached to an approval" },
      { name = "jobId"; typeName = #text; nullable = true; description = "The job record for the work, if linked" },
    ];
  };

  public let FLOOD_ZONES : Oql.Entity = {
    name = "flood_zones";
    primaryKey = "propertyId";
    description = "Each home's FEMA flood zone, as last looked up (a map reading, not a flood insurance determination). Without a propertyId condition, covers the homes the caller owns; to read a home the caller co-owns, manages or views, pin it with {\"eq\":{\"field\":\"propertyId\",\"value\":\"...\"}} or \"in\" (at most 20 homes per query).";
    fields = [
      { name = "propertyId"; typeName = #text; nullable = false; description = "The home" },
      { name = "status"; typeName = #text; nullable = false; description = "Mapped or NotMapped" },
      { name = "zone"; typeName = #text; nullable = false; description = "FEMA zone, e.g. AE or X" },
      { name = "zoneSubtype"; typeName = #text; nullable = false; description = "Zone subtype" },
      { name = "specialFloodHazardArea"; typeName = #bool; nullable = false; description = "True when the home is in a Special Flood Hazard Area" },
      { name = "baseFloodElevation"; typeName = #text; nullable = false; description = "Base flood elevation, as FEMA gives it" },
      { name = "firmPanel"; typeName = #text; nullable = false; description = "FIRM panel number" },
      { name = "firmEffectiveDate"; typeName = #text; nullable = false; description = "FIRM panel effective date" },
      { name = "checkedDate"; typeName = #text; nullable = false; description = "Looked up, YYYY-MM-DD (UTC)" },
    ];
  };

  public let MOVE_IN : Oql.Entity = {
    name = "move_in_tasks";
    primaryKey = "id";
    description = "Tasks on each home's move-in plan (often from the inspection report) and whether they're done. Without a propertyId condition, covers the homes the caller owns; to read a home the caller co-owns, manages or views, pin it with {\"eq\":{\"field\":\"propertyId\",\"value\":\"...\"}} or \"in\" (at most 20 homes per query).";
    fields = [
      { name = "id"; typeName = #text; nullable = false; description = "Task id" },
      { name = "propertyId"; typeName = #text; nullable = false; description = "The home" },
      { name = "title"; typeName = #text; nullable = false; description = "Task" },
      { name = "detail"; typeName = #text; nullable = false; description = "Detail" },
      { name = "area"; typeName = #text; nullable = false; description = "Part of the home, e.g. Roof" },
      { name = "urgency"; typeName = #text; nullable = false; description = "Safety, Repair or Monitor" },
      { name = "done"; typeName = #bool; nullable = false; description = "True once ticked off" },
    ];
  };

  public let ENTITIES : [Oql.Entity] = [HOMES, ROOMS, FIXTURES, INSURANCE_POLICIES, INSURANCE_CLAIMS, INVENTORY, WARRANTY_PLANS, WARRANTY_CLAIMS, MORTGAGES, TAX_YEARS, HOA_ASSESSMENTS, HOA_REVIEWS, FLOOD_ZONES, MOVE_IN];

  /// Most homes one query reads. Pro allows 20 homes.
  public let MAX_HOMES : Nat = 20;
};
