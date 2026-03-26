import { Page } from "@playwright/test";

/**
 * Injects a single mock property into window.__e2e_properties before React
 * boots so DashboardPage seeds the property store without hitting the canister.
 *
 * id is a plain number (not BigInt) because addInitScript only accepts
 * JSON-serialisable values.  String(1) === "1", so all propertyId comparisons
 * in the app still work correctly at runtime.
 */
export async function injectTestProperties(page: Page) {
  await page.addInitScript(() => {
    (window as any).__e2e_properties = [
      {
        id: 1,
        owner: "test-e2e-principal",
        address: "123 Maple Street",
        city: "Austin",
        state: "TX",
        zipCode: "78701",
        propertyType: "SingleFamily",
        yearBuilt: 2001,
        squareFeet: 2400,
        verificationLevel: "Unverified",
        tier: "Free",
        createdAt: 0,
        updatedAt: 0,
        isActive: true,
      },
    ];
  });
}
