import { HttpAgent } from "@dfinity/agent";

export interface Property {
  id:         string;
  address:    string;
  yearBuilt:  number;
  score:      number;
  scoreGrade: string;
}

const MOCK_PROPERTIES: Property[] = [
  { id: "prop_1", address: "123 Main St, Austin TX 78701", yearBuilt: 1998, score: 74, scoreGrade: "B" },
];

export async function getProperties(_agent?: HttpAgent): Promise<Property[]> {
  // TODO: replace with real canister call when EXPO_PUBLIC_PROPERTY_CANISTER_ID is set
  return MOCK_PROPERTIES;
}
