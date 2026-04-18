const JOB_CANISTER_ID = (process.env as any).JOB_CANISTER_ID || "";

// Flat referral fee charged to the contractor when a HomeGentic-sourced job
// is dual-signed as verified. Set at $15 (competitive below Angi's $15–$50).
const REFERRAL_FEE_CENTS = 1500;

export interface ReferralFeeRecord {
  jobId:         string;
  contractorId:  string;
  quoteId:       string;
  amountCents:   number;
  status:        "pending" | "collected" | "waived";
  createdAt:     number;
}

export const referralService = {
  REFERRAL_FEE_CENTS,

  /** Returns true if this job was sourced via a HomeGentic quote request. */
  isReferralJob(job: { sourceQuoteId?: string | null }): boolean {
    return typeof job.sourceQuoteId === "string" && job.sourceQuoteId.length > 0;
  },

  /** Returns the flat referral fee in cents. Fee is not percentage-based. */
  calculateFee(_jobAmountCents: number): number {
    return REFERRAL_FEE_CENTS;
  },

  /** Fetch pending referral fees (admin). Returns empty array when canister absent. */
  async getPendingFees(): Promise<ReferralFeeRecord[]> {
    if (import.meta.env.DEV && !JOB_CANISTER_ID) return [];
    // TODO(#82): call job canister getReferralFees() once implemented on-chain
    return [];
  },
};
