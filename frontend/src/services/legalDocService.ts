/**
 * Legal Document Service — Epic 10.6
 *
 *  10.6.3  getTemplates    — state-specific curated document library
 *  10.6.4  legalDocService — uploaded signed documents (stored via photo canister in prod)
 */

// ─── 10.6.3 ──────────────────────────────────────────────────────────────────

export type LegalDocType =
  | "PurchaseAgreement"
  | "CounterOfferForm"
  | "EarnestMoneyAgreement"
  | "SellerDisclosure";

export interface LegalTemplate {
  id:          string;
  title:       string;
  state:       string; // state abbreviation, or "All" for universal
  docType:     LegalDocType;
  description: string;
}

const TEMPLATES: LegalTemplate[] = [
  // ── Universal ──────────────────────────────────────────────────────────────
  {
    id:          "t-all-pa",
    title:       "Residential Purchase Agreement",
    state:       "All",
    docType:     "PurchaseAgreement",
    description: "Standard residential purchase and sale agreement.",
  },
  {
    id:          "t-all-co",
    title:       "Counter-Offer Form",
    state:       "All",
    docType:     "CounterOfferForm",
    description: "Seller's counter-offer to buyer's purchase offer.",
  },
  {
    id:          "t-all-em",
    title:       "Earnest Money Agreement",
    state:       "All",
    docType:     "EarnestMoneyAgreement",
    description: "Earnest money deposit agreement and escrow instructions.",
  },
  {
    id:          "t-all-sd",
    title:       "Seller's Disclosure Statement",
    state:       "All",
    docType:     "SellerDisclosure",
    description: "Seller's disclosure of known property conditions and material facts.",
  },
  // ── Florida ────────────────────────────────────────────────────────────────
  {
    id:          "t-fl-pa",
    title:       "Florida As-Is Residential Contract",
    state:       "FL",
    docType:     "PurchaseAgreement",
    description: "Florida-specific as-is residential contract for sale and purchase.",
  },
  // ── California ─────────────────────────────────────────────────────────────
  {
    id:          "t-ca-pa",
    title:       "California Residential Purchase Agreement (RPA)",
    state:       "CA",
    docType:     "PurchaseAgreement",
    description: "California Association of Realtors standard purchase agreement.",
  },
  // ── Texas ──────────────────────────────────────────────────────────────────
  {
    id:          "t-tx-pa",
    title:       "Texas One to Four Family Residential Contract",
    state:       "TX",
    docType:     "PurchaseAgreement",
    description: "TREC-promulgated residential purchase contract for Texas.",
  },
];

/**
 * Returns all universal templates plus any state-specific templates for the
 * given state abbreviation (e.g. "TX", "FL", "CA").
 */
export function getTemplates(state: string): LegalTemplate[] {
  return TEMPLATES.filter((t) => t.state === "All" || t.state === state);
}

// ─── 10.6.4 ──────────────────────────────────────────────────────────────────

export interface LegalDoc {
  id:         string;
  propertyId: string;
  docType:    string;
  filename:   string;
  uploadedAt: number; // ms epoch
}

function createLegalDocService() {
  let _store: LegalDoc[] = [];
  let _seq = 0;

  return {
    /**
     * Records a signed document upload. In production this also pushes the
     * file to the `photo` canister with DocumentType so it is stored on-chain.
     */
    logUpload(propertyId: string, docType: string, filename: string): LegalDoc {
      const doc: LegalDoc = {
        id:         `ldoc-${++_seq}`,
        propertyId,
        docType,
        filename,
        uploadedAt: Date.now(),
      };
      _store = [..._store, doc];
      return doc;
    },

    getUploads(propertyId: string): LegalDoc[] {
      return _store.filter((d) => d.propertyId === propertyId);
    },

    __reset() {
      _store = [];
      _seq   = 0;
    },
  };
}

export const legalDocService = createLegalDocService();
