/**
 * Session-wide data every tab needs: who's signed in (role, display name), the
 * plan from the payment canister, the homeowner's properties and which one is
 * active, plus open/close state for the two global sheets (assistant and
 * property switcher).
 */
import React, { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuthContext } from "../auth/AuthContext";
import { getProperties, Property } from "../services/propertyService";
import { AgentUsage, getAgentUsage } from "../services/agentService";
import { getAgentSessionToken } from "../services/agentSession";
import { getMySubscription, PLAN_LIMITS, PlanLimits, PlanTier, Subscription, isPaid, tierForRole } from "../services/planService";
import { AppState } from "react-native";
import { offlineQueue } from "../services/offlineQueue";
import { createJob, CreateJobInput } from "../services/jobService";

export interface AppData {
  contractor:      boolean;
  /** Tier for the signed-in role (a contractor is never "Free"/"Pro"). */
  tier:            PlanTier;
  pro:             boolean;
  limits:          PlanLimits;
  subscription:    Subscription | null;
  /** Re-reads the plan — "I'm back, check my plan". */
  refreshPlan:     () => Promise<PlanTier>;

  /** AI calls used this period, from the voice Worker; null until loaded. */
  usage:           AgentUsage | null;
  refreshUsage:    () => void;

  displayName:     string;
  /** "" when the profile has no usable name. */
  firstName:       string;

  properties:      Property[];
  propertiesLoaded: boolean;
  propertiesError: boolean;
  activeProperty:  Property | null;
  setActivePropertyId: (id: string) => void;
  /** Properties beyond the plan's limit are listed but can't be opened. */
  isPropertyLocked: (p: Property) => boolean;
  refreshProperties: () => Promise<void>;

  askOpen:   boolean;
  openAsk:   () => void;
  closeAsk:  () => void;
  propsOpen: boolean;
  openProps: () => void;
  closeProps: () => void;
}

const Ctx = createContext<AppData | null>(null);

/** "dana.mireles@…" → "Dana Mireles". The auth profile has no name field. */
export function nameFromEmail(email: string | undefined | null): string {
  const local = (email ?? "").split("@")[0];
  const words = local.split(/[._\-+]+/).filter((w) => /[a-z]/i.test(w)).map((w) => w.replace(/\d+/g, ""));
  return words.filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}

export function AppDataProvider({ children }: { children: ReactNode }) {
  const { authState } = useAuthContext();
  const profile    = authState.status === "authenticated" ? authState.profile : null;
  const contractor = profile?.role === "Contractor";

  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [properties, setProperties]     = useState<Property[]>([]);
  const [propertiesLoaded, setLoaded]   = useState(false);
  const [propertiesError, setPropErr]   = useState(false);
  const [activeId, setActiveId]         = useState<string | null>(null);
  const [askOpen, setAskOpen]           = useState(false);
  const [propsOpen, setPropsOpen]       = useState(false);
  const [usage, setUsage]               = useState<AgentUsage | null>(null);

  const tier   = tierForRole(subscription?.tier ?? "Free", contractor);
  const limits = PLAN_LIMITS[tier];

  const refreshPlan = useCallback(async () => {
    const sub = await getMySubscription().catch(() => null);
    if (sub) setSubscription(sub);
    return tierForRole(sub?.tier ?? "Free", contractor);
  }, [contractor]);

  const refreshProperties = useCallback(async () => {
    if (contractor) { setLoaded(true); return; }
    try {
      const list = await getProperties();
      setProperties(list);
      setPropErr(false);
    } catch {
      setPropErr(true);
    } finally {
      setLoaded(true);
    }
  }, [contractor]);

  const refreshUsage = useCallback(() => {
    getAgentSessionToken().then(getAgentUsage).then(setUsage).catch(() => {});
  }, []);

  useEffect(() => {
    refreshPlan();
    refreshProperties();
    refreshUsage();
  }, [refreshPlan, refreshProperties, refreshUsage]);

  // Writes saved while offline belong to this user and are sent with their
  // identity: on sign-in, on reconnect (the queue listens) and on foreground.
  const principal = authState.status === "authenticated" ? authState.principal : null;
  useEffect(() => {
    if (!principal) return;
    offlineQueue.setScope(principal);
    offlineQueue.registerHandler(async (op) => {
      if (op.type === "createJob") await createJob(op.payload as CreateJobInput);
      else throw new Error("This kind of change can't be sent from this version of the app.");
    });
    const flush = () => { offlineQueue.flush().then(refreshProperties).catch(() => {}); };
    flush();
    const sub = AppState.addEventListener("change", (st) => { if (st === "active") flush(); });
    return () => {
      sub.remove();
      offlineQueue.registerHandler(null);
      offlineQueue.setScope(null);
    };
  }, [principal, refreshProperties]);

  const isPropertyLocked = useCallback(
    (p: Property) => properties.findIndex((x) => x.id === p.id) >= limits.propertyLimit,
    [properties, limits.propertyLimit],
  );

  const activeProperty = useMemo(() => {
    const open = properties.filter((p) => !isPropertyLocked(p));
    return open.find((p) => p.id === activeId) ?? open[0] ?? null;
  }, [properties, activeId, isPropertyLocked]);

  const emailName   = nameFromEmail(profile?.email);
  const displayName = emailName || (contractor ? "Your business" : "Your account");

  const value: AppData = {
    contractor,
    tier,
    pro: isPaid(tier),
    limits,
    subscription,
    refreshPlan,
    usage,
    refreshUsage,
    displayName,
    firstName: emailName.split(" ")[0],
    properties,
    propertiesLoaded,
    propertiesError,
    activeProperty,
    setActivePropertyId: setActiveId,
    isPropertyLocked,
    refreshProperties,
    askOpen,
    openAsk:    () => { setPropsOpen(false); setAskOpen(true); },
    closeAsk:   () => setAskOpen(false),
    propsOpen,
    openProps:  () => { setAskOpen(false); setPropsOpen(true); },
    closeProps: () => setPropsOpen(false),
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppData(): AppData {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAppData must be used inside AppDataProvider");
  return ctx;
}
