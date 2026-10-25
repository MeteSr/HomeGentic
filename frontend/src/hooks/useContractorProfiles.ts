import { useEffect, useState } from "react";
import { contractorService, type ContractorProfile } from "@/services/contractor";

/**
 * Looks up the contractor profile behind each bid's principal, so the jobs
 * pages can show a real name, verification status and countersigned job count
 * (`jobsCompleted` only goes up when a job is verified by both sides).
 * A principal with no profile, or a failed lookup, maps to null.
 */
export function useContractorProfiles(principals: string[]): Record<string, ContractorProfile | null> {
  const [profiles, setProfiles] = useState<Record<string, ContractorProfile | null>>({});
  const key = [...new Set(principals)].sort().join(",");

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    const ids = key.split(",");
    Promise.all(ids.map(id => contractorService.getContractor(id).catch(() => null)))
      .then(results => {
        if (cancelled) return;
        const map: Record<string, ContractorProfile | null> = {};
        ids.forEach((id, i) => { map[id] = results[i]; });
        setProfiles(map);
      });
    return () => { cancelled = true; };
  }, [key]);

  return profiles;
}

/** "12 verified jobs" from the profile, or null when there's no profile to read. */
export function verifiedJobsLabel(profile: ContractorProfile | null | undefined): string | null {
  if (!profile) return null;
  const n = profile.jobsCompleted;
  return `${n} verified job${n === 1 ? "" : "s"}`;
}

/** The earliest bid-window close time across requests, or null if none has one. */
export function earliestCloseAt(requests: { closeAt?: number }[]): number | null {
  const times = requests.map(r => r.closeAt).filter((t): t is number => typeof t === "number");
  return times.length > 0 ? Math.min(...times) : null;
}
