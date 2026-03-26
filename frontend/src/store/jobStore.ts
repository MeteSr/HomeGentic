import { create } from "zustand";
import { Job } from "@/services/job";

interface JobState {
  jobs: Job[];
  isLoading: boolean;
  setJobs: (jobs: Job[]) => void;
  addJob: (job: Job) => void;
  updateJob: (job: Job) => void;
  setLoading: (v: boolean) => void;
}

export const useJobStore = create<JobState>((set) => ({
  jobs: [],
  isLoading: false,
  setJobs: (jobs) => set({ jobs }),
  addJob: (job) => set((s) => ({ jobs: [...s.jobs, job] })),
  updateJob: (job) => set((s) => ({ jobs: s.jobs.map((j) => (j.id === job.id ? job : j)) })),
  setLoading: (isLoading) => set({ isLoading }),
}));
