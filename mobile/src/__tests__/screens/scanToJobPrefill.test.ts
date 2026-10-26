/**
 * @jest-environment node
 */
// ScanDocumentScreen used to show "Document Saved" and keep nothing. The scan
// now opens Log a Job prefilled with these fields; the job is the saved record.
jest.mock("expo-image-picker", () => ({}));
import { scanToJobPrefill } from "../../screens/ScanDocumentScreen";

const FORM = {
  brand: "Rheem", modelNumber: "XE50", serialNumber: "S123", serviceType: "plumbing",
  purchaseDate: "2025-06-01", warrantyMonths: "72",
};

describe("scanToJobPrefill", () => {
  it("maps the confirmed scan to a Log a Job prefill", () => {
    expect(scanToJobPrefill(FORM, "50-gallon water heater warranty card.")).toEqual({
      serviceType:    "Plumbing",
      description:    "Rheem XE50. Serial S123. 50-gallon water heater warranty card.",
      completedDate:  "2025-06-01",
      warrantyMonths: "72",
    });
  });

  it("leaves fields blank when the scan didn't give usable values", () => {
    expect(scanToJobPrefill({ ...FORM, serviceType: "appliance", purchaseDate: "June 2025", warrantyMonths: "lifetime" }, "")).toEqual(
      expect.objectContaining({ serviceType: "", completedDate: "", warrantyMonths: "" }),
    );
  });
});
