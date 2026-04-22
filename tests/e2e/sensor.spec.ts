import { test, expect } from "@playwright/test";
import { injectTestAuth } from "./helpers/auth";
import { injectSensorDevices } from "./helpers/testData";

async function setup(page: Parameters<typeof injectTestAuth>[0]) {
  await injectTestAuth(page);
  await page.addInitScript(() => {
    (window as any).__e2e_subscription = { tier: "Pro", expiresAt: null };
    (window as any).__e2e_properties = [
      {
        id: 1, owner: "test-e2e-principal",
        address: "123 Maple Street", city: "Austin", state: "TX", zipCode: "78701",
        propertyType: "SingleFamily", yearBuilt: 2001, squareFeet: 2400,
        verificationLevel: "Unverified", tier: "Pro",
        createdAt: 0, updatedAt: 0, isActive: true,
      },
    ];
  });
}

test.describe("SensorPage — /sensor", () => {
  test.beforeEach(async ({ page }) => {
    await injectSensorDevices(page, { "1": [] });
    await setup(page);
    await page.goto("/sensor");
    await expect(page.getByRole("heading", { name: /smart home sensors/i })).toBeVisible();
  });

  // ── Page structure ───────────────────────────────────────────────────────────

  test("shows 'IoT Gateway' eyebrow label", async ({ page }) => {
    await expect(page.getByText("IoT Gateway")).toBeVisible();
  });

  test("shows 'Register Device' button", async ({ page }) => {
    await expect(page.getByRole("button", { name: /register device/i }).first()).toBeVisible();
  });

  test("shows empty state when no devices registered", async ({ page }) => {
    await expect(page.getByText(/no devices registered/i)).toBeVisible();
  });

  // ── Register Device modal — source dropdown ──────────────────────────────────

  test.describe("Register Device modal", () => {
    test.beforeEach(async ({ page }) => {
      await page.getByRole("button", { name: /register device/i }).first().click();
      await expect(page.getByRole("heading", { name: /register device/i })).toBeVisible();
    });

    test("shows Device Type selector", async ({ page }) => {
      await expect(page.getByLabel(/device type/i)).toBeVisible();
    });

    test("dropdown includes Google Nest", async ({ page }) => {
      await expect(page.getByLabel(/device type/i).locator("option", { hasText: /google nest/i })).toHaveCount(1);
    });

    test("dropdown includes Ecobee", async ({ page }) => {
      await expect(page.getByLabel(/device type/i).locator("option", { hasText: /ecobee/i })).toHaveCount(1);
    });

    test("dropdown includes Moen Flo", async ({ page }) => {
      await expect(page.getByLabel(/device type/i).locator("option", { hasText: /moen flo/i })).toHaveCount(1);
    });

    test("dropdown includes Ring Alarm", async ({ page }) => {
      await expect(page.getByLabel(/device type/i).locator("option", { hasText: /ring alarm/i })).toHaveCount(1);
    });

    test("dropdown includes Honeywell Home", async ({ page }) => {
      await expect(page.getByLabel(/device type/i).locator("option", { hasText: /honeywell home/i })).toHaveCount(1);
    });

    test("dropdown includes Rheem EcoNet", async ({ page }) => {
      await expect(page.getByLabel(/device type/i).locator("option", { hasText: /rheem econet/i })).toHaveCount(1);
    });

    test("dropdown includes Sense Energy Monitor", async ({ page }) => {
      await expect(page.getByLabel(/device type/i).locator("option", { hasText: /sense energy/i })).toHaveCount(1);
    });

    test("dropdown includes Emporia Vue", async ({ page }) => {
      await expect(page.getByLabel(/device type/i).locator("option", { hasText: /emporia vue/i })).toHaveCount(1);
    });

    test("dropdown includes Rachio Smart Sprinkler", async ({ page }) => {
      await expect(page.getByLabel(/device type/i).locator("option", { hasText: /rachio/i })).toHaveCount(1);
    });

    test("dropdown includes Samsung SmartThings", async ({ page }) => {
      await expect(page.getByLabel(/device type/i).locator("option", { hasText: /smartthings/i })).toHaveCount(1);
    });

    test("dropdown includes Home Assistant", async ({ page }) => {
      await expect(page.getByLabel(/device type/i).locator("option", { hasText: /home assistant/i })).toHaveCount(1);
    });

    test("dropdown includes Manual Entry", async ({ page }) => {
      await expect(page.getByLabel(/device type/i).locator("option", { hasText: /manual entry/i })).toHaveCount(1);
    });

    test("dropdown has 12 source options in total", async ({ page }) => {
      const options = page.getByLabel(/device type/i).locator("option");
      await expect(options).toHaveCount(12);
    });

    test("Cancel button closes the modal", async ({ page }) => {
      await page.getByRole("button", { name: /cancel/i }).click();
      await expect(page.getByRole("heading", { name: /register device/i })).not.toBeVisible();
    });
  });

  // ── Pre-registered devices with new sources ──────────────────────────────────

  test.describe("device list — new source labels", () => {
    test.beforeEach(async ({ page }) => {
      await injectSensorDevices(page, {
        "1": [
          { id: "d1", externalDeviceId: "RING-001", source: "RingAlarm",     name: "Front Door Sensor", isActive: true  },
          { id: "d2", externalDeviceId: "HW-002",   source: "HoneywellHome", name: "Thermostat",        isActive: true  },
          { id: "d3", externalDeviceId: "HA-003",   source: "HomeAssistant", name: "Hub",               isActive: false },
        ],
      });
      await setup(page);
      await page.goto("/sensor");
      await expect(page.getByRole("heading", { name: /smart home sensors/i })).toBeVisible();
    });

    test("shows device name for RingAlarm device", async ({ page }) => {
      await expect(page.getByText("Front Door Sensor")).toBeVisible();
    });

    test("shows 'Ring Alarm' label for RingAlarm source", async ({ page }) => {
      await expect(page.getByText(/ring alarm/i).first()).toBeVisible();
    });

    test("shows device name for HoneywellHome device", async ({ page }) => {
      await expect(page.getByText("Thermostat")).toBeVisible();
    });

    test("shows 'Honeywell Home' label for HoneywellHome source", async ({ page }) => {
      await expect(page.getByText(/honeywell home/i).first()).toBeVisible();
    });

    test("shows device name for HomeAssistant device", async ({ page }) => {
      await expect(page.getByText("Hub")).toBeVisible();
    });

    test("shows 'Home Assistant' label for HomeAssistant source", async ({ page }) => {
      await expect(page.getByText(/home assistant/i).first()).toBeVisible();
    });

    test("shows Active badge for active device", async ({ page }) => {
      // At least one Active badge rendered for the two active devices
      await expect(page.getByText("Active").first()).toBeVisible();
    });

    test("shows Inactive badge for deactivated device", async ({ page }) => {
      await expect(page.getByText("Inactive").first()).toBeVisible();
    });
  });
});
