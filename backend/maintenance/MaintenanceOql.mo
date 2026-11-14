/// The maintenance canister's OQL catalogue (see shared/Oql.mo): the tasks a
/// household has planned for its homes. No principals are exposed: an
/// assistant gets the task, not who entered it.
import Oql "../shared/Oql";

module {
  public let PLANNED : Oql.Entity = {
    name = "planned_tasks";
    primaryKey = "id";
    description = "Maintenance tasks the household has planned for its homes, each with the year (and usually the month) it is planned for, an optional cost estimate, and whether it has been marked done. Planned by the household, not appointments with anyone. Without a propertyId condition, covers the homes the caller planned tasks for; to read a home the caller co-owns, manages or views, pin it with {\"eq\":{\"field\":\"propertyId\",\"value\":\"...\"}} or \"in\" (at most 20 homes per query).";
    fields = [
      { name = "id"; typeName = #text; nullable = false; description = "Task id" },
      { name = "propertyId"; typeName = #text; nullable = false; description = "The home the task is for" },
      { name = "systemName"; typeName = #text; nullable = false; description = "The system or area, as entered (HVAC, Roofing, Gutters, ...)" },
      { name = "task"; typeName = #text; nullable = false; description = "What is planned, as entered" },
      { name = "plannedYear"; typeName = #int; nullable = false; description = "Year it is planned for" },
      { name = "plannedMonth"; typeName = #int; nullable = true; description = "Month number it is planned for (1 = January); null when only the year was set" },
      { name = "plannedPeriod"; typeName = #text; nullable = false; description = "YYYY-MM, or YYYY when no month was set; compares correctly as text" },
      { name = "estimatedCostCents"; typeName = #int; nullable = true; description = "The household's cost estimate in US cents (12500 = $125.00), if one was entered" },
      { name = "completed"; typeName = #bool; nullable = false; description = "True once the household marked it done (marking done doesn't create a job record)" },
      { name = "createdDate"; typeName = #text; nullable = false; description = "When the task was planned, YYYY-MM-DD (UTC)" },
    ];
  };

  public let ENTITIES : [Oql.Entity] = [PLANNED];

  /// Most homes one query reads. Pro allows 20 homes.
  public let MAX_HOMES : Nat = 20;
};
