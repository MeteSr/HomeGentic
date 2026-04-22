import { Page } from "@playwright/test";

type PlanTier = "Free" | "Basic" | "Pro" | "Premium" | "ContractorPro";

// ── Quote helpers ─────────────────────────────────────────────────────────────

/**
 * Replaces quoteService.getRequests() mock data with the supplied requests.
 * Used to test tier-limit enforcement without hitting the canister.
 */
export async function injectQuoteRequests(
  page: Page,
  requests: Array<{
    id: string; propertyId: string; homeowner: string;
    serviceType: string; urgency: string; description: string;
    status: "open" | "quoted" | "accepted" | "closed"; createdAt: number;
  }>
) {
  await page.addInitScript((reqs) => {
    (window as any).__e2e_quote_requests = reqs;
  }, requests);
}

/**
 * Injects mock bids (Quote objects) for one or more quote requests.
 * quoteService.getQuotesForRequest() filters these by requestId.
 */
export async function injectQuotes(
  page: Page,
  quotes: Array<{
    id: string; requestId: string; contractor: string;
    amount: number; timeline: number; validUntil: number;
    status: "pending" | "accepted" | "rejected" | "expired"; createdAt: number;
  }>
) {
  await page.addInitScript((qs) => {
    (window as any).__e2e_quotes = qs;
  }, quotes);
}

/**
 * Injects mock contractor profiles into window.__e2e_contractors.
 * contractorService.search(), getTopRated(), and getMyProfile() all check this.
 */
export async function injectContractors(
  page: Page,
  contractors: Array<{
    id: string; name: string; specialties: string[];
    email: string; phone: string;
    bio?: string | null; licenseNumber?: string | null; serviceArea?: string | null;
    trustScore: number; jobsCompleted: number; isVerified: boolean; createdAt: number;
  }>
) {
  await page.addInitScript((cs) => {
    (window as any).__e2e_contractors = cs;
  }, contractors);
}

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

    // Seed job history so dashboard stats and property detail are populated.
    // Total: $11,830 | Verified: 3 (HVAC, Plumbing, Painting) | Roofing: awaiting sig
    (window as any).__e2e_jobs = [
      {
        id: "1", propertyId: "1", homeowner: "test-e2e-principal",
        serviceType: "HVAC", contractorName: "Cool Air Services",
        amount: 240_000, date: "2023-03-15",
        description: "Full HVAC system replacement.",
        isDiy: false, status: "verified", verified: true,
        homeownerSigned: true, contractorSigned: true,
        photos: [], createdAt: Date.now() - 86_400_000 * 30,
      },
      {
        id: "2", propertyId: "1", homeowner: "test-e2e-principal",
        serviceType: "Roofing", contractorName: "Top Roof Co",
        amount: 850_000, date: "2023-07-22",
        description: "Full roof replacement after storm damage.",
        isDiy: false, status: "completed", verified: false,
        homeownerSigned: false, contractorSigned: false,
        photos: [], createdAt: Date.now() - 86_400_000 * 15,
      },
      {
        id: "3", propertyId: "1", homeowner: "test-e2e-principal",
        serviceType: "Plumbing", contractorName: "Flow Masters",
        amount: 65_000, date: "2023-09-10",
        description: "Fixed leaking pipes under kitchen sink.",
        isDiy: false, status: "verified", verified: true,
        homeownerSigned: true, contractorSigned: true,
        photos: [], createdAt: Date.now() - 86_400_000 * 10,
      },
      {
        id: "4", propertyId: "1", homeowner: "test-e2e-principal",
        serviceType: "Painting", isDiy: true,
        amount: 28_000, date: "2023-11-05",
        description: "Painted living room and hallway.",
        status: "verified", verified: true,
        homeownerSigned: true, contractorSigned: true,
        photos: [], createdAt: Date.now() - 86_400_000 * 5,
      },
    ];
  });
}

/**
 * Injects a mock subscription tier into window.__e2e_subscription.
 * Used to bypass paymentService.getMySubscription() canister call so
 * tier-gated pages (WarrantyWallet, RecurringService, etc.) render correctly.
 */
export async function injectSubscription(page: Page, tier: PlanTier = "Pro") {
  await page.addInitScript((t) => {
    (window as any).__e2e_subscription = { tier: t, expiresAt: null };
  }, tier);
}

/**
 * Injects mock recurring services into window.__e2e_recurring.
 * Covers: LawnCare (active), PestControl (active), PoolMaintenance (cancelled).
 */
export async function injectRecurringServices(page: Page) {
  await page.addInitScript(() => {
    (window as any).__e2e_recurring = [
      {
        id: "rs1",
        propertyId: "1",
        owner: "test-e2e-principal",
        serviceType: "LawnCare",
        providerName: "Green Thumb Lawns",
        providerLicense: "TX-LAWN-001",
        providerPhone: "512-555-0100",
        frequency: "Monthly",
        startDate: "2025-01-01",
        contractEndDate: "2025-12-31",
        status: "Active",
        notes: "Weekly mow + edge trim",
        visitLog: [
          { date: "2025-01-15", note: "First visit — all good." },
          { date: "2025-02-15", note: "Trimmed hedges extra." },
        ],
        contractDocUrl: null,
        createdAt: Date.now() - 86_400_000 * 90,
      },
      {
        id: "rs2",
        propertyId: "1",
        owner: "test-e2e-principal",
        serviceType: "PestControl",
        providerName: "Shield Pest Co",
        providerLicense: null,
        providerPhone: "512-555-0200",
        frequency: "Quarterly",
        startDate: "2025-02-01",
        contractEndDate: null,
        status: "Active",
        notes: null,
        visitLog: [],
        contractDocUrl: null,
        createdAt: Date.now() - 86_400_000 * 60,
      },
      {
        id: "rs3",
        propertyId: "1",
        owner: "test-e2e-principal",
        serviceType: "PoolMaintenance",
        providerName: "Blue Water Pool",
        providerLicense: null,
        providerPhone: null,
        frequency: "Weekly",
        startDate: "2024-06-01",
        contractEndDate: "2024-12-01",
        status: "Cancelled",
        notes: "Cancelled after season ended.",
        visitLog: [],
        contractDocUrl: null,
        createdAt: Date.now() - 86_400_000 * 300,
      },
    ];
  });
}

/**
 * Injects mock score events into window.__e2e_score_events.
 * Each event represents a job completion that contributed to the HomeGentic score.
 */
export async function injectScoreEvents(page: Page) {
  await page.addInitScript(() => {
    const now = Date.now();
    (window as any).__e2e_score_events = [
      {
        id: "se1",
        propertyId: "1",
        jobId: "1",
        eventType: "JobVerified",
        points: 25,
        description: "HVAC replacement verified by contractor",
        createdAt: now - 86_400_000 * 30,
      },
      {
        id: "se2",
        propertyId: "1",
        jobId: "3",
        eventType: "JobVerified",
        points: 15,
        description: "Plumbing repair verified by contractor",
        createdAt: now - 86_400_000 * 10,
      },
      {
        id: "se3",
        propertyId: "1",
        jobId: "4",
        eventType: "DiyJobLogged",
        points: 5,
        description: "DIY painting logged",
        createdAt: now - 86_400_000 * 5,
      },
    ];
  });
}

/**
 * Injects mock FSBO listing photos into window.__e2e_listing_photos.
 * photoService.getListingPhotos() checks this before making canister calls,
 * and listingService.getListingPhotos() checks window.__e2e_listing_photo_order.
 *
 * Pass a propertyId matching the listing under test.  Three photos are injected
 * by default (cover + 2 gallery shots).
 */
export async function injectFsboPhotos(page: Page, propertyId: string = "1") {
  await page.addInitScript(
    ({ pid }: { pid: string }) => {
      const FAKE_URL = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";
      const photos = [
        {
          id:          "LP_1",
          jobId:       `LISTING_${pid}`,
          propertyId:  pid,
          phase:       "Listing",
          description: "Front exterior",
          hash:        "aaa",
          url:         FAKE_URL,
          size:        128,
          verified:    false,
          createdAt:   Date.now() - 86_400_000,
        },
        {
          id:          "LP_2",
          jobId:       `LISTING_${pid}`,
          propertyId:  pid,
          phase:       "Listing",
          description: "Living room",
          hash:        "bbb",
          url:         FAKE_URL,
          size:        128,
          verified:    false,
          createdAt:   Date.now() - 86_300_000,
        },
        {
          id:          "LP_3",
          jobId:       `LISTING_${pid}`,
          propertyId:  pid,
          phase:       "Listing",
          description: "Backyard",
          hash:        "ccc",
          url:         FAKE_URL,
          size:        128,
          verified:    false,
          createdAt:   Date.now() - 86_200_000,
        },
      ];
      (window as any).__e2e_listing_photos = { [pid]: photos };
      (window as any).__e2e_listing_photo_order = { [pid]: ["LP_1", "LP_2", "LP_3"] };
    },
    { pid: propertyId }
  );
}

/**
 * Injects mock sensor devices into window.__e2e_devices (keyed by propertyId)
 * and mock pending alerts into window.__e2e_alerts (keyed by propertyId).
 * sensorService.getDevicesForProperty() and getPendingAlerts() check these
 * maps before making canister calls.
 */
export async function injectSensorDevices(
  page: Page,
  devicesByProperty: Record<string, Array<{
    id: string; externalDeviceId: string; source: string; name: string; isActive: boolean;
  }>>
) {
  await page.addInitScript((map: Record<string, any[]>) => {
    const now = Date.now();
    const result: Record<string, object[]> = {};
    for (const [pid, devices] of Object.entries(map)) {
      result[pid] = devices.map((d) => ({
        id:               d.id,
        propertyId:       pid,
        homeowner:        "test-e2e-principal",
        externalDeviceId: d.externalDeviceId,
        source:           d.source,
        name:             d.name,
        registeredAt:     now - 86_400_000,
        isActive:         d.isActive,
      }));
    }
    (window as any).__e2e_devices = result;
    (window as any).__e2e_alerts  = {};   // no pending alerts by default
  }, devicesByProperty);
}

/**
 * Injects mock baseline photos into window.__e2e_baseline_photos.
 * photoService.getByJob() checks this map (keyed by jobId = "baseline_<propertyId>")
 * before making canister calls.
 *
 * Pass an array of system keys already photographed for each property.
 * All 6 keys: "hvac" | "waterHeater" | "electrical" | "shutoff" | "roof" | "garageDoor"
 */
export async function injectBaselinePhotos(
  page: Page,
  byProperty: Record<string, string[]>   // { propertyId: systemKey[] }
) {
  await page.addInitScript((map: Record<string, string[]>) => {
    const FAKE_URL = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";
    const result: Record<string, object[]> = {};
    for (const [pid, keys] of Object.entries(map)) {
      result[`baseline_${pid}`] = keys.map((k, i) => ({
        id:          `bp_${pid}_${k}`,
        jobId:       `baseline_${pid}`,
        propertyId:  pid,
        phase:       "PostConstruction",
        description: k,
        hash:        `hash_${k}`,
        url:         FAKE_URL,
        size:        128,
        verified:    false,
        createdAt:   Date.now() - i * 1000,
      }));
    }
    (window as any).__e2e_baseline_photos = result;
  }, byProperty);
}

/**
 * Injects a mock return value for propertyService.registerProperty().
 * Without this, the onboarding wizard's step 2→3 transition calls the canister
 * and fails in E2E (no replica running).  The injected property is returned
 * immediately so the wizard advances to step 3.
 */
export async function injectRegisterProperty(page: Page) {
  await page.addInitScript(() => {
    (window as any).__e2e_register_property = {
      id: 99,
      owner: "test-e2e-principal",
      address: "100 Onboarding Lane",
      city: "Austin",
      state: "TX",
      zipCode: "78701",
      propertyType: "SingleFamily",
      yearBuilt: 2000,
      squareFeet: 2000,
      verificationLevel: "Unverified",
      tier: "Free",
      createdAt: 0,
      updatedAt: 0,
      isActive: true,
    };
  });
}

/**
 * Injects mock warranty jobs (jobs with warrantyMonths > 0) alongside
 * the standard property fixture. Covers all three warranty states:
 * active, expiring-soon, and expired.
 */
export async function injectWarrantyJobs(page: Page) {
  const now = Date.now();
  const MS_MONTH = 1000 * 60 * 60 * 24 * 30;

  await page.addInitScript(
    ({ now: n, ms }: { now: number; ms: number }) => {
      (window as any).__e2e_properties = [
        {
          id: 1, owner: "test-e2e-principal",
          address: "123 Maple Street", city: "Austin", state: "TX", zipCode: "78701",
          propertyType: "SingleFamily", yearBuilt: 2001, squareFeet: 2400,
          verificationLevel: "Unverified", tier: "Pro",
          createdAt: 0, updatedAt: 0, isActive: true,
        },
      ];
      (window as any).__e2e_jobs = [
        // Active: 24-month warranty started 18 months ago → ~6 months left
        {
          id: "w1", propertyId: "1", homeowner: "test-e2e-principal",
          serviceType: "HVAC", contractorName: "Cool Air Services",
          amount: 240_000,
          date: new Date(n - ms * 18).toISOString().slice(0, 10),
          description: "HVAC replacement.", isDiy: false,
          status: "verified", verified: true,
          homeownerSigned: true, contractorSigned: true,
          warrantyMonths: 24, photos: [], createdAt: n - ms * 18,
        },
        // Expiring: 12-month warranty started 11.5 months ago → ~15 days left
        {
          id: "w2", propertyId: "1", homeowner: "test-e2e-principal",
          serviceType: "Roofing", contractorName: "Top Roof Co",
          amount: 850_000,
          date: new Date(n - ms * 11 - 86_400_000 * 15).toISOString().slice(0, 10),
          description: "Roof replacement.", isDiy: false,
          status: "verified", verified: true,
          homeownerSigned: true, contractorSigned: true,
          warrantyMonths: 12, photos: [], createdAt: n - ms * 11,
        },
        // Expired: 12-month warranty started 14 months ago
        {
          id: "w3", propertyId: "1", homeowner: "test-e2e-principal",
          serviceType: "Plumbing", contractorName: "Flow Masters",
          amount: 65_000,
          date: new Date(n - ms * 14).toISOString().slice(0, 10),
          description: "Plumbing fix.", isDiy: false,
          status: "verified", verified: true,
          homeownerSigned: true, contractorSigned: true,
          warrantyMonths: 12, photos: [], createdAt: n - ms * 14,
        },
      ];
    },
    { now, ms: MS_MONTH }
  );
}
