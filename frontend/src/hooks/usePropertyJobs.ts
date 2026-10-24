import { useState, useEffect } from "react";
import { jobService, type Job } from "@/services/job";
import toast from "react-hot-toast";

export interface PropertyJobs {
  jobs: Job[];
  loading: boolean;
  /** The last load failed — show a retry rather than an empty history. */
  error: boolean;
  reload(): Promise<void>;
  verifyJob(jobId: string): Promise<void>;
}

export function usePropertyJobs(propertyId: string | undefined): PropertyJobs {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!propertyId) { setLoading(false); return; }
    let cancelled = false;
    setError(false);
    jobService.getByProperty(propertyId)
      .then((list) => { if (!cancelled) setJobs(list); })
      .catch((e) => {
        console.error("[usePropertyJobs] initial load failed:", e);
        if (!cancelled) setError(true);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [propertyId]);

  async function reload() {
    if (!propertyId) return;
    try {
      setJobs(await jobService.getByProperty(propertyId));
      setError(false);
    } catch (e) {
      console.error("[usePropertyJobs] reload failed:", e);
      setError(true);
    }
  }

  async function verifyJob(jobId: string) {
    try {
      const updated = await jobService.verifyJob(jobId);
      setJobs((prev) => prev.map((j) => (j.id === updated.id ? updated : j)));
    } catch {
      toast.error("Could not sign job. Please try again.");
    }
  }

  return { jobs, loading, error, reload, verifyJob };
}
