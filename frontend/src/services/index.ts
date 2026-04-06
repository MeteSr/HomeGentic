export * from "./actor";
export * from "./auth";

// Explicit re-exports for service files that also export `idlFactory`.
// Using `export *` from multiple modules that all export `idlFactory` causes
// a TS2308 ambiguity error.  Import idlFactory directly from each service
// file when you need it (e.g. in candid contract tests).
export type {
  PropertyType,
  VerificationLevel,
  SubscriptionTier,
  Property,
  TransferRecord,
  PendingTransfer,
  RegisterPropertyArgs,
} from "./property";
export { propertyService } from "./property";

export type { JobStatus, Job, InvitePreview } from "./job";
export { jobService, INSURANCE_SERVICE_TYPES, isInsuranceRelevant } from "./job";

export type { PlanTier, Plan } from "./payment";
export { PLANS, paymentService } from "./payment";

export * from "./contractor";
export * from "./quote";
export * from "./photo";
