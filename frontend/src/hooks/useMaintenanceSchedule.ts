import { useState, useEffect } from "react";
import { recurringService, type RecurringService, type VisitLog } from "@/services/recurringService";
import { systemAgesService, type SystemAges } from "@/services/systemAges";
import type { Property } from "@/services/property";

export interface MaintenanceSchedule {
  recurringServices: RecurringService[];
  visitLogMap: Record<string, VisitLog[]>;
  systemAges: SystemAges;
}

export function useMaintenanceSchedule(
  properties: Property[],
  propLoading: boolean,
  activePropertyId: string | null
): MaintenanceSchedule {
  const [recurringServices, setRecurringServices] = useState<RecurringService[]>([]);
  const [visitLogMap, setVisitLogMap] = useState<Record<string, VisitLog[]>>({});
  const [systemAges, setSystemAges] = useState<SystemAges>({});

  // Load recurring services once properties are ready
  useEffect(() => {
    if (propLoading || properties.length === 0) return;
    let cancelled = false;

    async function load() {
      try {
        const allServices: RecurringService[] = [];
        for (const p of properties) {
          const svcs = await recurringService.getByProperty(String(p.id));
          allServices.push(...svcs);
        }
        if (cancelled) return;
        setRecurringServices(allServices);

        const logEntries = await Promise.all(
          allServices.map(async (s) => {
            const logs = await recurringService.getVisitLogs(s.id).catch(() => [] as VisitLog[]);
            return [s.id, logs] as [string, VisitLog[]];
          })
        );
        if (!cancelled) setVisitLogMap(Object.fromEntries(logEntries));
      } catch { /* canister not deployed */ }
    }

    load();
    return () => { cancelled = true; };
  }, [propLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reload system ages whenever the active property changes
  useEffect(() => {
    if (activePropertyId) {
      setSystemAges(systemAgesService.get(activePropertyId));
    }
  }, [activePropertyId]);

  return { recurringServices, visitLogMap, systemAges };
}
