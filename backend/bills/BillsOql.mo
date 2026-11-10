/// The bills canister's OQL catalogue (see shared/Oql.mo): the household's
/// utility bills and its fixed recurring housing costs. No principals are
/// exposed: an assistant gets the record, not who entered it.
import Oql "../shared/Oql";

module {
  public let BILLS : Oql.Entity = {
    name = "bills";
    primaryKey = "id";
    description = "Utility bills for the caller's homes (electric, gas, water, internet, phone, other), with usage and the anomaly flag set when a bill was over 20% above the previous three months' average for the same utility. Without a propertyId condition, covers the homes the caller entered records for; to read a home the caller co-owns, manages or views, pin it with {\"eq\":{\"field\":\"propertyId\",\"value\":\"...\"}} or \"in\" (at most 20 homes per query).";
    fields = [
      { name = "id"; typeName = #text; nullable = false; description = "Bill id" },
      { name = "propertyId"; typeName = #text; nullable = false; description = "The home the bill is for" },
      { name = "billType"; typeName = #text; nullable = false; description = "Electric, Gas, Water, Internet, Telecom or Other" },
      { name = "provider"; typeName = #text; nullable = false; description = "The utility company, as entered (e.g. FPL)" },
      { name = "periodStart"; typeName = #text; nullable = false; description = "First day of the billing period, YYYY-MM-DD; compares correctly as text" },
      { name = "periodEnd"; typeName = #text; nullable = false; description = "Last day of the billing period, YYYY-MM-DD" },
      { name = "periodMonth"; typeName = #text; nullable = false; description = "Month the billing period starts in, YYYY-MM (handy for groupBy)" },
      { name = "periodYear"; typeName = #int; nullable = true; description = "Calendar year the billing period starts in" },
      { name = "amountCents"; typeName = #int; nullable = false; description = "Bill total in US cents (12500 = $125.00)" },
      { name = "usageAmount"; typeName = #float; nullable = true; description = "Usage on the bill, in usageUnit" },
      { name = "usageUnit"; typeName = #text; nullable = true; description = "kWh, gallons, therms, Mbps, ..." },
      { name = "anomalyFlag"; typeName = #bool; nullable = false; description = "True when the bill was over 20% above the average of the previous three months for the same utility" },
      { name = "anomalyReason"; typeName = #text; nullable = true; description = "Why it was flagged, in words" },
      { name = "uploadedDate"; typeName = #text; nullable = false; description = "When the bill was entered, YYYY-MM-DD (UTC)" },
    ];
  };

  public let RECURRING : Oql.Entity = {
    name = "recurring_expenses";
    primaryKey = "id";
    description = "Fixed housing costs entered once with a schedule: mortgage, property tax, HOA, home insurance, other. Only the owner and co-owners see mortgage entries. Without a propertyId condition, covers the homes the caller entered records for; to read a home the caller co-owns, manages or views, pin it with {\"eq\":{\"field\":\"propertyId\",\"value\":\"...\"}} or \"in\" (at most 20 homes per query).";
    fields = [
      { name = "id"; typeName = #text; nullable = false; description = "Expense id" },
      { name = "propertyId"; typeName = #text; nullable = false; description = "The home it is for" },
      { name = "category"; typeName = #text; nullable = false; description = "Mortgage, PropertyTax, HOA, HomeInsurance or Other" },
      { name = "provider"; typeName = #text; nullable = false; description = "Lender, county, HOA or insurer, as entered" },
      { name = "amountCents"; typeName = #int; nullable = false; description = "Amount per payment in US cents (not per month)" },
      { name = "frequency"; typeName = #text; nullable = false; description = "Monthly, Quarterly, SemiAnnual or Annual" },
      { name = "annualCents"; typeName = #int; nullable = false; description = "What it comes to over a year, in US cents (amountCents x payments a year)" },
      { name = "startDate"; typeName = #text; nullable = false; description = "First payment, YYYY-MM-DD" },
      { name = "endDate"; typeName = #text; nullable = true; description = "Last payment, YYYY-MM-DD; null while ongoing" },
    ];
  };

  public let ENTITIES : [Oql.Entity] = [BILLS, RECURRING];

  /// Most homes one query reads. Pro allows 20 homes.
  public let MAX_HOMES : Nat = 20;
};
