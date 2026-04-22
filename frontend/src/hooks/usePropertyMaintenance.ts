import { useState, useEffect } from "react";
import { recurringService, type RecurringService, type VisitLog } from "@/services/recurringService";
import { systemAgesService, type SystemAges } from "@/services/systemAges";

export interface PropertyMaintenance {
  recurringServices: RecurringService[];
  visitLogMap: Record<string, VisitLog[]>;
  systemAges: SystemAges;
}

export function usePropertyMaintenance(propertyId: string | undefined): PropertyMaintenance {
  const [recurringServices, setRecurringServices] = useState<RecurringService[]>([]);
  const [visitLogMap, setVisitLogMap] = useState<Record<string, VisitLog[]>>({});
  const [systemAges, setSystemAges] = useState<SystemAges>({});

  useEffect(() => {
    if (!propertyId) return;
    setSystemAges(systemAgesService.get(propertyId));
    recurringService.getByProperty(propertyId).then(async (svcs) => {
      setRecurringServices(svcs);
      const logEntries = await Promise.all(
        svcs.map(async (s) => {
          const logs = await recurringService.getVisitLogs(s.id).catch(() => [] as VisitLog[]);
          return [s.id, logs] as [string, VisitLog[]];
        })
      );
      setVisitLogMap(Object.fromEntries(logEntries));
    }).catch((e) => console.error("[usePropertyMaintenance] load failed:", e));
  }, [propertyId]);

  return { recurringServices, visitLogMap, systemAges };
}
