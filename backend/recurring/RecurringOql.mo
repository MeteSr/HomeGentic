/// The recurring canister's OQL catalogue (see shared/Oql.mo): a household's
/// ongoing service contracts and their visit logs. No principals and no
/// provider licence numbers are exposed.
import Oql "../shared/Oql";

module {
  public let SERVICES : Oql.Entity = {
    name = "services";
    primaryKey = "id";
    description = "Ongoing home services the household has recorded (lawn care, pest control, pool, gutters, pressure washing, other), with the provider, how often they come, the last visit logged and an estimate of the next. Without a propertyId condition, covers the homes the caller added services for; to read a home the caller co-owns, manages or views, pin it with {\"eq\":{\"field\":\"propertyId\",\"value\":\"...\"}} or \"in\" (at most 20 homes per query).";
    fields = [
      { name = "id"; typeName = #text; nullable = false; description = "Service id" },
      { name = "propertyId"; typeName = #text; nullable = false; description = "The home the service is for" },
      { name = "serviceType"; typeName = #text; nullable = false; description = "LawnCare, PestControl, PoolMaintenance, GutterCleaning, PressureWashing or Other" },
      { name = "providerName"; typeName = #text; nullable = false; description = "The company or person, as entered" },
      { name = "providerPhone"; typeName = #text; nullable = true; description = "Their phone number, if entered" },
      { name = "frequency"; typeName = #text; nullable = false; description = "Weekly, BiWeekly, Monthly, Quarterly, SemiAnnually or Annually" },
      { name = "startDate"; typeName = #text; nullable = false; description = "When the service started, YYYY-MM-DD" },
      { name = "contractEndDate"; typeName = #text; nullable = true; description = "When the contract ends, YYYY-MM-DD; null when open-ended" },
      { name = "status"; typeName = #text; nullable = false; description = "Active, Paused or Cancelled" },
      { name = "notes"; typeName = #text; nullable = true; description = "The household's notes" },
      { name = "hasContract"; typeName = #bool; nullable = false; description = "True when a contract document is attached" },
      { name = "visitCount"; typeName = #int; nullable = false; description = "How many visits the household has logged" },
      { name = "lastVisitDate"; typeName = #text; nullable = true; description = "The latest visit logged, YYYY-MM-DD; null when none" },
      { name = "nextVisitEstimate"; typeName = #text; nullable = true; description = "For an Active service: the last visit logged (or the start date) plus the frequency, YYYY-MM-DD. An estimate from the household's own log, not an appointment with the provider; a past date means a visit hasn't been logged since. Null when Paused or Cancelled" },
    ];
  };

  public let VISITS : Oql.Entity = {
    name = "visits";
    primaryKey = "id";
    description = "Visits the household logged against a recurring service. Without a propertyId condition, covers the homes the caller added services for; to read a home the caller co-owns, manages or views, pin it with {\"eq\":{\"field\":\"propertyId\",\"value\":\"...\"}} or \"in\" (at most 20 homes per query).";
    fields = [
      { name = "id"; typeName = #text; nullable = false; description = "Visit id" },
      { name = "serviceId"; typeName = #text; nullable = false; description = "The service (services.id)" },
      { name = "propertyId"; typeName = #text; nullable = false; description = "The home" },
      { name = "visitDate"; typeName = #text; nullable = false; description = "Date of the visit, YYYY-MM-DD; compares correctly as text" },
      { name = "note"; typeName = #text; nullable = true; description = "The household's note on the visit" },
      { name = "serviceType"; typeName = #text; nullable = false; description = "The service's type" },
      { name = "providerName"; typeName = #text; nullable = false; description = "The service's provider" },
    ];
  };

  public let ENTITIES : [Oql.Entity] = [SERVICES, VISITS];

  /// Most homes one query reads. Pro allows 20 homes.
  public let MAX_HOMES : Nat = 20;
};
