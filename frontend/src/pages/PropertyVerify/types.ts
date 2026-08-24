export type VerifyStep =
  | "claim" | "identity" | "document" | "representative"
  | "status" | "expired" | "contested";

export interface VerifyClaimData {
  propertyId           : string;
  address              : string;
  city                 : string;
  state                : string;
  verificationLevel    : string;
  claimStartedAt       : number;
  claimWindowEndsAt    : number;
  identityVerified     : boolean;
  identityVerifiedAt  ?: number;
  nameOnId            ?: string;
  verificationDocHash ?: string;
  verificationMethod  ?: string;
  nameOnDocument      ?: string;
  contestedWithId     ?: string;
  conflictWindowEndsAt?: number;
  currentStep          : VerifyStep;
}

export interface VerifyContextValue {
  claim    : VerifyClaimData;
  refresh  : () => Promise<void>;
}
