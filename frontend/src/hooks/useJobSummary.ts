import { useState, useEffect, useRef, useCallback } from "react";
import { jobService, type Job } from "@/services/job";
import type { Property } from "@/services/property";
import toast from "react-hot-toast";

export interface JobSummary {
  allJobs: Job[];
  pendingProposals: Job[];
  loading: boolean;
  reload(): Promise<void>;
  approveProposal(id: string): Promise<void>;
  rejectProposal(id: string): Promise<void>;
}

export function useJobSummary(properties: Property[], propLoading: boolean): JobSummary {
  const [allJobs, setAllJobs] = useState<Job[]>([]);
  const [pendingProposals, setPendingProposals] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const propertiesRef = useRef(properties);
  propertiesRef.current = properties;

  const loadJobs = useCallback(async (propList: Property[]) => {
    try {
      if (propList.length === 0) { setAllJobs([]); return; }
      const perProp = await Promise.all(
        propList.map((p) => jobService.getByProperty(String(p.id)).catch(() => [] as Job[]))
      );
      const merged = perProp.flat();
      setAllJobs(merged.length > 0 ? merged : await jobService.getAll().catch(() => []));
    } catch { /* canister not deployed */ }
  }, []);

  const loadPendingProposals = useCallback(async () => {
    try {
      if (import.meta.env.DEV && (window as any).__e2e_pending_proposals) {
        setPendingProposals((window as any).__e2e_pending_proposals as Job[]);
        return;
      }
      setPendingProposals(await jobService.getPendingProposals());
    } catch { /* canister not deployed */ }
  }, []);

  useEffect(() => {
    if (propLoading) return; // wait for properties to finish loading
    let cancelled = false;
    Promise.all([loadJobs(properties), loadPendingProposals()])
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [propLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  async function reload() {
    await Promise.all([loadJobs(propertiesRef.current), loadPendingProposals()]);
  }

  async function approveProposal(proposalId: string) {
    try {
      await jobService.approveJobProposal(proposalId);
      setPendingProposals((prev) => prev.filter((p) => p.id !== proposalId));
      toast.success("Proposal approved — job added to your history.");
    } catch (err: any) {
      toast.error("Failed to approve: " + err.message);
    }
  }

  async function rejectProposal(proposalId: string) {
    try {
      await jobService.rejectJobProposal(proposalId);
      setPendingProposals((prev) => prev.filter((p) => p.id !== proposalId));
      toast.success("Proposal declined.");
    } catch (err: any) {
      toast.error("Failed to decline: " + err.message);
    }
  }

  return { allJobs, pendingProposals, loading, reload, approveProposal, rejectProposal };
}
