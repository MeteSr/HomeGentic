const JOB_CANISTER_ID = (process.env as any).JOB_CANISTER_ID || "";

// Referral fee charged to a ContractorFree contractor on the awarded value of
// each winning bid sourced via a HomeGentic quote request, with a flat-dollar
// floor on small jobs. ContractorPro pays neither.
const REFERRAL_FEE_RATE        = 0.03; // 3% of awarded value
const REFERRAL_FEE_FLOOR_CENTS = 2000; // $20 minimum per winning bid

export interface ReferralFeeRecord {
  jobId:         string;
  contractorId:  string;
  quoteId:       string;
  amountCents:   number;
  status:        "pending" | "collected" | "waived";
  createdAt:     number;
}

export const referralService = {
  REFERRAL_FEE_RATE,
  REFERRAL_FEE_FLOOR_CENTS,

  /** Returns true if this job was sourced via a HomeGentic quote request. */
  isReferralJob(job: { sourceQuoteId?: string | null }): boolean {
    return typeof job.sourceQuoteId === "string" && job.sourceQuoteId.length > 0;
  },

  /** Fee (in cents) owed on a bid awarded at `jobAmountCents` — 3% of the
   *  awarded value, or the $20 floor on small jobs, whichever is greater. */
  calculateFee(jobAmountCents: number): number {
    return Math.max(REFERRAL_FEE_FLOOR_CENTS, Math.round(jobAmountCents * REFERRAL_FEE_RATE));
  },

  /** True when a bid at `jobAmountCents` is charged the flat floor rather than the percentage. */
  isFloored(jobAmountCents: number): boolean {
    return jobAmountCents * REFERRAL_FEE_RATE < REFERRAL_FEE_FLOOR_CENTS;
  },

  /** Fetch pending referral fees (admin). Returns empty array when canister absent. */
  async getPendingFees(): Promise<ReferralFeeRecord[]> {
    // Calls job canister getReferralFees() once implemented on-chain (tracked in #82)
    return [];
  },
};
