/**
 * Unit tests for useJobStore (Zustand)
 */

import { describe, it, expect, beforeEach } from "vitest";
import { useJobStore } from "@/store/jobStore";
import type { Job } from "@/services/job";

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: "job-1",
    propertyId: "prop-1",
    serviceType: "HVAC",
    date: "2024-01-15",
    amount: 50000,
    isDiy: false,
    verified: false,
    homeownerSigned: false,
    contractorSigned: false,
    createdAt: Date.now(),
    ...overrides,
  } as Job;
}

function getStore() {
  return useJobStore.getState();
}

function resetStore() {
  useJobStore.setState({ jobs: [], isLoading: false });
}

describe("useJobStore — initial state", () => {
  beforeEach(resetStore);

  it("starts with empty jobs array", () => {
    expect(getStore().jobs).toEqual([]);
  });

  it("starts with isLoading false", () => {
    expect(getStore().isLoading).toBe(false);
  });
});

describe("useJobStore — setJobs", () => {
  beforeEach(resetStore);

  it("replaces the jobs array", () => {
    const jobs = [makeJob({ id: "j1" }), makeJob({ id: "j2" })];
    getStore().setJobs(jobs);
    expect(getStore().jobs).toHaveLength(2);
    expect(getStore().jobs[0].id).toBe("j1");
  });

  it("can set to empty array", () => {
    getStore().setJobs([makeJob()]);
    getStore().setJobs([]);
    expect(getStore().jobs).toHaveLength(0);
  });
});

describe("useJobStore — addJob", () => {
  beforeEach(resetStore);

  it("appends a job to the list", () => {
    const j = makeJob({ id: "j-new" });
    getStore().addJob(j);
    expect(getStore().jobs).toHaveLength(1);
    expect(getStore().jobs[0].id).toBe("j-new");
  });

  it("keeps existing jobs when adding", () => {
    getStore().addJob(makeJob({ id: "j1" }));
    getStore().addJob(makeJob({ id: "j2" }));
    expect(getStore().jobs).toHaveLength(2);
  });
});

describe("useJobStore — updateJob", () => {
  beforeEach(resetStore);

  it("replaces the job with matching id", () => {
    getStore().setJobs([makeJob({ id: "j1", serviceType: "HVAC" })]);
    getStore().updateJob(makeJob({ id: "j1", serviceType: "Plumbing" }));
    expect(getStore().jobs[0].serviceType).toBe("Plumbing");
  });

  it("leaves other jobs untouched", () => {
    getStore().setJobs([
      makeJob({ id: "j1", serviceType: "HVAC" }),
      makeJob({ id: "j2", serviceType: "Roofing" }),
    ]);
    getStore().updateJob(makeJob({ id: "j1", serviceType: "Electrical" }));
    expect(getStore().jobs[1].serviceType).toBe("Roofing");
  });

  it("is a no-op when id does not exist", () => {
    getStore().setJobs([makeJob({ id: "j1" })]);
    getStore().updateJob(makeJob({ id: "j999" }));
    expect(getStore().jobs[0].id).toBe("j1");
    expect(getStore().jobs).toHaveLength(1);
  });
});

describe("useJobStore — setLoading", () => {
  beforeEach(resetStore);

  it("sets isLoading to true", () => {
    getStore().setLoading(true);
    expect(getStore().isLoading).toBe(true);
  });

  it("sets isLoading back to false", () => {
    getStore().setLoading(true);
    getStore().setLoading(false);
    expect(getStore().isLoading).toBe(false);
  });
});
