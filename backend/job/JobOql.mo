/// The job canister's OQL catalogue (see shared/Oql.mo): one entity, "jobs",
/// the household's maintenance record with the owner's own marks joined in.
/// No principals (homeowner, contractor) are exposed: an assistant gets the
/// record, not who's behind it.
import Oql "../shared/Oql";

module {
  public let JOBS : Oql.Entity = {
    name = "jobs";
    primaryKey = "id";
    description = "Work done on the caller's homes, by a contractor or by the homeowner (DIY), plus contractor proposals awaiting the homeowner. Without a propertyId condition, covers the homes the caller owns; to read a home someone else owns that the caller co-owns, manages or views, pin it with {\"eq\":{\"field\":\"propertyId\",\"value\":\"...\"}} or \"in\" (at most 20 homes per query).";
    fields = [
      { name = "id"; typeName = #text; nullable = false; description = "Job id" },
      { name = "propertyId"; typeName = #text; nullable = false; description = "The home the job belongs to" },
      { name = "title"; typeName = #text; nullable = false; description = "Short title; for serviceType Other it names the kind of work (Inspection, Septic, Generator, ...)" },
      { name = "serviceType"; typeName = #text; nullable = false; description = "Kind of work: Roofing, HVAC, Plumbing, Electrical, Painting, Flooring, Windows, Landscaping, Gutters, ... or Other" },
      { name = "description"; typeName = #text; nullable = false; description = "What was done" },
      { name = "contractorName"; typeName = #text; nullable = true; description = "Who did it; null for DIY work" },
      { name = "amountCents"; typeName = #int; nullable = false; description = "What it cost, in US cents (12500 = $125.00)" },
      { name = "completedDate"; typeName = #text; nullable = false; description = "When the work was done, YYYY-MM-DD (UTC); compares correctly as text" },
      { name = "completedYear"; typeName = #int; nullable = false; description = "Calendar year the work was done" },
      { name = "permitNumber"; typeName = #text; nullable = true; description = "Building permit number, if one was recorded" },
      { name = "permitStatus"; typeName = #text; nullable = true; description = "The permit's status as the household recorded it: Open, Closed or Expired (not checked with the permit office)" },
      { name = "warrantyMonths"; typeName = #int; nullable = true; description = "Length of the work's warranty in months, if any" },
      { name = "isDiy"; typeName = #bool; nullable = false; description = "True when the homeowner did the work" },
      { name = "status"; typeName = #text; nullable = false; description = "Pending, InProgress, Completed, Verified, PendingHomeownerApproval (a contractor's proposal) or RejectedByHomeowner" },
      { name = "verified"; typeName = #bool; nullable = false; description = "True once every required party has signed; verified jobs are locked and count toward the home's score and reports" },
      { name = "homeownerSigned"; typeName = #bool; nullable = false; description = "The homeowner has signed" },
      { name = "contractorSigned"; typeName = #bool; nullable = false; description = "The contractor has signed" },
      { name = "costCategory"; typeName = #text; nullable = true; description = "The owner's own mark for their improvements record: Improvement or Repair (a note for their tax preparer, not a tax determination)" },
    ];
  };

  public let ENTITIES : [Oql.Entity] = [JOBS];

  /// Most homes one query reads. Pro allows 20 homes.
  public let MAX_HOMES : Nat = 20;
};
