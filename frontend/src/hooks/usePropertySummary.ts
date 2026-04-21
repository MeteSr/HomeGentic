import { useState, useEffect } from "react";
import { propertyService, type Property, type ManagedProperty, type OwnerNotification } from "@/services/property";
import { usePropertyStore } from "@/store/propertyStore";
import toast from "react-hot-toast";

export interface PropertySummary {
  properties: Property[];
  managedProperties: ManagedProperty[];
  ownerNotifs: OwnerNotification[];
  loading: boolean;
  dismissAllNotifications(): Promise<void>;
}

export function usePropertySummary(): PropertySummary {
  const { properties, setProperties } = usePropertyStore();
  const [managedProperties, setManagedProperties] = useState<ManagedProperty[]>([]);
  const [ownerNotifs, setOwnerNotifs] = useState<OwnerNotification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      let propList: Property[] = [];

      // E2E mock injection — skip canister calls and resolve immediately
      if (import.meta.env.DEV && (window as any).__e2e_properties) {
        propList = (window as any).__e2e_properties as Property[];
        setProperties(propList);
        if (!cancelled) setLoading(false);
        return;
      } else {
        try {
          propList = await propertyService.getMyProperties();
          setProperties(propList);
        } catch (err: any) {
          toast.error("Failed to load properties: " + err.message);
        }
      }

      if (cancelled) return;

      await Promise.all([
        propertyService.getMyManagedProperties()
          .then((list) => { if (!cancelled) setManagedProperties(list); })
          .catch(() => {}),
        loadOwnerNotifications(propList),
      ]);

      if (!cancelled) setLoading(false);
    }

    async function loadOwnerNotifications(propList: Property[]) {
      if (propList.length === 0) return;
      try {
        const allNotifs = await Promise.all(
          propList.map((p) =>
            propertyService.getOwnerNotifications(BigInt(p.id))
              .catch(() => [] as OwnerNotification[])
          )
        );
        if (!cancelled) {
          setOwnerNotifs(allNotifs.flat().sort((a, b) => b.timestamp - a.timestamp));
        }
      } catch { /* canister not deployed */ }
    }

    load();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function dismissAllNotifications() {
    const unseenPropertyIds = [...new Set(
      ownerNotifs
        .filter((n) => !n.seen)
        .map(() => properties.map((p) => BigInt(p.id)))
        .flat()
    )];
    await Promise.all(
      unseenPropertyIds.map((id) => propertyService.dismissNotifications(id).catch(() => {}))
    );
    setOwnerNotifs((prev) => prev.map((n) => ({ ...n, seen: true })));
  }

  return { properties, managedProperties, ownerNotifs, loading, dismissAllNotifications };
}
