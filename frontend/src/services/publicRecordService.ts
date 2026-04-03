/**
 * Public Record Service — 3.3.2
 *
 * Unauthenticated lookup of any homeowner's properties and jobs by principal.
 * This is the "dead man's switch" — records are readable by anyone even if
 * HomeFax shuts down.
 */

export interface PublicProperty {
  id:      string;
  address: string;
  owner:   string;
  [key: string]: unknown;
}

export interface PublicJob {
  id:          string;
  propertyId:  string;
  homeowner:   string;
  serviceType: string;
  [key: string]: unknown;
}

export interface PublicOwnerRecord {
  ownerPrincipal: string;
  properties:     PublicProperty[];
  jobs:           PublicJob[];
  fetchedAt:      number;
}

interface SeedData {
  properties: PublicProperty[];
  jobs:       PublicJob[];
}

export function createPublicRecordService(seed?: SeedData) {
  const properties: PublicProperty[] = seed?.properties ?? [];
  const jobs: PublicJob[]            = seed?.jobs ?? [];

  async function getByOwner(principal: string): Promise<PublicOwnerRecord> {
    if (!principal) throw new Error("principal must not be empty");

    return {
      ownerPrincipal: principal,
      properties:     properties.filter(p => p.owner === principal),
      jobs:           jobs.filter(j => j.homeowner === principal),
      fetchedAt:      Date.now(),
    };
  }

  return { getByOwner };
}

export const publicRecordService = createPublicRecordService();
