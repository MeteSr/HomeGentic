import { HttpAgent } from "@dfinity/agent";

export type JobStatus = "pending" | "awaiting_contractor" | "verified";

export interface Job {
  id:           string;
  propertyId:   string;
  serviceType:  string;
  description:  string;
  amountCents:  number;
  completedDate: string;
  status:       JobStatus;
  isDiy:        boolean;
  contractorName?: string;
}

const MOCK_JOBS: Job[] = [
  {
    id:            "job_1",
    propertyId:    "prop_1",
    serviceType:   "HVAC",
    description:   "Annual HVAC service and filter replacement",
    amountCents:   18000,
    completedDate: "2025-10-15",
    status:        "verified",
    isDiy:         false,
    contractorName: "Cool Air Services",
  },
  {
    id:            "job_2",
    propertyId:    "prop_1",
    serviceType:   "Plumbing",
    description:   "Fixed leaking kitchen faucet",
    amountCents:   32000,
    completedDate: "2025-08-03",
    status:        "verified",
    isDiy:         true,
  },
];

export async function getJobs(propertyId: string, _agent?: HttpAgent): Promise<Job[]> {
  // TODO: replace with real canister call
  return MOCK_JOBS.filter((j) => j.propertyId === propertyId);
}
