import { HttpAgent, Actor } from "@icp-sdk/core/agent";
import { IDL }              from "@icp-sdk/core/candid";
import { getIcpAgent }      from "./icpAgent";

export interface Property {
  id:         string;
  address:    string;
  yearBuilt:  number;
  score:      number;    // always 0 — score canister not wired on mobile yet
  scoreGrade: string;    // always "-"
}

// ── Canister wiring ───────────────────────────────────────────────────────────

const PROPERTY_CANISTER_ID = process.env.EXPO_PUBLIC_PROPERTY_CANISTER_ID ?? "";

const propertyIdlFactory = ({ IDL: I }: { IDL: typeof IDL }) => {
  const PropertyType = I.Variant({
    SingleFamily: I.Null,
    Condo:        I.Null,
    Townhouse:    I.Null,
    MultiFamily:  I.Null,
  } as Record<string, IDL.Type>);

  const VerificationLevel = I.Variant({
    Unverified:    I.Null,
    PendingReview: I.Null,
    Basic:         I.Null,
    Premium:       I.Null,
  } as Record<string, IDL.Type>);

  const SubscriptionTier = I.Variant({
    Free:          I.Null,
    Pro:           I.Null,
    Premium:       I.Null,
    ContractorPro: I.Null,
  } as Record<string, IDL.Type>);

  const Property = I.Record({
    id:                I.Nat,
    owner:             I.Principal,
    address:           I.Text,
    city:              I.Text,
    state:             I.Text,
    zipCode:           I.Text,
    propertyType:      PropertyType,
    yearBuilt:         I.Nat,
    squareFeet:        I.Nat,
    verificationLevel: VerificationLevel,
    tier:              SubscriptionTier,
    createdAt:         I.Int,
    updatedAt:         I.Int,
    isActive:          I.Bool,
  });

  return I.Service({
    getMyProperties: I.Func([], [I.Vec(Property)], ["query"]),
  });
};

function fromRaw(raw: any): Property {
  return {
    id:         String(raw.id),
    address:    `${raw.address}, ${raw.city}, ${raw.state} ${raw.zipCode}`,
    yearBuilt:  Number(raw.yearBuilt),
    score:      0,
    scoreGrade: "-",
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function getProperties(agent?: HttpAgent): Promise<Property[]> {
  const ag = agent ?? getIcpAgent();
  const a = Actor.createActor(propertyIdlFactory as any, {
    agent: ag,
    canisterId: PROPERTY_CANISTER_ID,
  });
  const raw: any[] = await (a as any).getMyProperties();
  return raw.map(fromRaw);
}
