/**
 * mlsService — Epic 10.3.6
 *
 * Thin wrapper around the flat-fee MLS partner API (e.g. Houzeo / ListingSpark).
 * Submits an FSBO listing to the MLS on behalf of the seller.
 */

export interface MlsSubmitResult {
  listingId: string;
  url: string;
  status: "submitted" | "pending";
}

export const mlsService = {
  async submit(
    propertyId: string,
    listPriceCents: number,
    address: string
  ): Promise<MlsSubmitResult> {
    const res = await fetch("/api/mls/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ propertyId, listPriceCents, address }),
    });
    if (!res.ok) {
      throw new Error(`MLS submission failed: ${res.status}`);
    }
    return res.json() as Promise<MlsSubmitResult>;
  },
};
