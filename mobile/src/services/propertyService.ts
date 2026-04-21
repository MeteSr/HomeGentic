import { HttpAgent } from "@icp-sdk/core/agent";

export interface Property {
  id:         string;
  address:    string;
  yearBuilt:  number;
  score:      number;
  scoreGrade: string;
}

export async function getProperties(_agent?: HttpAgent): Promise<Property[]> {
  throw new Error("Not implemented: getProperties — wire to property canister getMyProperties");
}
