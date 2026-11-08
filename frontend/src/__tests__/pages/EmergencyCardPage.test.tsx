/**
 * EmergencyCardPage (#715): one printable page per home with its shutoffs,
 * alarm, insurer and contacts, plus a storm checklist for hurricane states.
 */
import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MemoryRouter } from "react-router-dom";

const { mockUseParams, mockNavigate } = vi.hoisted(() => ({
  mockUseParams: vi.fn(() => ({ id: "prop-1" })),
  mockNavigate: vi.fn(),
}));
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useParams: mockUseParams, useNavigate: () => mockNavigate };
});
vi.mock("@/components/Layout", () => ({
  Layout: ({ children }: any) => <div data-testid="layout">{children}</div>,
}));

const { svc } = vi.hoisted(() => ({
  svc: { getProperty: vi.fn(), getGuide: vi.fn(), getPolicy: vi.fn(), getPhotos: vi.fn() },
}));
vi.mock("@/services/property", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/property")>();
  return { ...actual, propertyService: { getProperty: svc.getProperty } };
});
vi.mock("@/services/houseGuide", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/houseGuide")>();
  return { ...actual, houseGuideService: { get: svc.getGuide } };
});
vi.mock("@/services/insurancePolicy", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/insurancePolicy")>();
  return { ...actual, insurancePolicyService: { get: svc.getPolicy } };
});
vi.mock("@/services/photo", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/photo")>();
  return { ...actual, photoService: { getByJob: svc.getPhotos } };
});

import EmergencyCardPage from "@/pages/EmergencyCardPage";
import { EMPTY_GUIDE } from "@/services/houseGuide";

const PROPERTY = { id: "prop-1", address: "40 Lake Dr", city: "Orlando", state: "FL", zipCode: "32801" };
const GUIDE = {
  ...EMPTY_GUIDE,
  waterShutoff: "Front yard, by the meter",
  alarm: "ADT, keypad by the garage door",
  wifiPassword: "secret-wifi",
  contacts: [
    { name: "Citizens claims", role: "Insurance claims", phone: "866-411-2742" },
    { name: "Bob's Plumbing", role: "Plumber", phone: "(407) 555-0199" },
  ],
};
const POLICY = {
  carrier: "Citizens",
  policyNumber: "FL-123",
  renewalDate: "2027-06-01",
  coverageA: null,
  hurricaneDeductible: null,
};
const PHOTOS = [
  { id: "ph-water", jobId: "baseline_prop-1", propertyId: "prop-1", description: "shutoff", url: "blob:water" },
  { id: "ph-job", jobId: "job-9", propertyId: "prop-1", description: "shutoff", url: "blob:job" },
];

function renderPage() {
  return render(
    <MemoryRouter>
      <EmergencyCardPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 8, 15)); // mid-September: hurricane season
  mockUseParams.mockReturnValue({ id: "prop-1" });
  svc.getProperty.mockResolvedValue(PROPERTY);
  svc.getGuide.mockResolvedValue(GUIDE);
  svc.getPolicy.mockResolvedValue(POLICY);
  svc.getPhotos.mockResolvedValue(PHOTOS);
});
afterEach(() => vi.useRealTimers());

describe("EmergencyCardPage", () => {
  it("shows the shutoffs, alarm, insurer and contacts from the home's records", async () => {
    renderPage();
    expect(await screen.findByRole("heading", { name: "Emergency card" })).toBeInTheDocument();
    expect(screen.getByText("40 Lake Dr, Orlando, FL 32801")).toBeInTheDocument();

    const shutoffs = screen.getByRole("region", { name: "Shutoffs" });
    expect(within(shutoffs).getByText("Front yard, by the meter")).toBeInTheDocument();
    expect(within(shutoffs).getAllByText("Not written down yet")).toHaveLength(2);
    // The onboarding photo, not a job photo with the same label.
    expect(within(shutoffs).getByRole("img", { name: "Main water shut-off" })).toHaveAttribute("src", "blob:water");

    expect(svc.getPhotos).toHaveBeenCalledWith("baseline_prop-1");
    expect(screen.getByText("ADT, keypad by the garage door")).toBeInTheDocument();
    expect(screen.getByText("Citizens")).toBeInTheDocument();
    expect(screen.getByText("FL-123")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Call the claim line 866-411-2742/ })).toHaveAttribute(
      "href",
      "tel:8664112742",
    );
    expect(screen.getByRole("link", { name: /Call Bob's Plumbing/ })).toHaveAttribute("href", "tel:4075550199");
    // Never the Wi-Fi password: the card is meant to be printed and pinned up.
    expect(screen.queryByText("secret-wifi")).not.toBeInTheDocument();
  });

  it("names what's missing and links to where to add it", async () => {
    svc.getGuide.mockResolvedValue(null);
    svc.getPolicy.mockResolvedValue(null);
    svc.getPhotos.mockResolvedValue([]);
    renderPage();
    const missing = await screen.findByRole("region", { name: "Not on this card yet" });
    expect(within(missing).getByText("Where the gas shut-off is")).toBeInTheDocument();
    expect(within(missing).getByText("Your insurance policy")).toBeInTheDocument();
    expect(within(missing).getByRole("link", { name: "Fill in the house guide" })).toHaveAttribute(
      "href",
      "/properties/prop-1?tab=guide",
    );
    expect(within(missing).getByRole("link", { name: "Add your policy" })).toHaveAttribute(
      "href",
      "/properties/prop-1?tab=insurance",
    );
  });

  it("prints the page", async () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Print" }));
    expect(print).toHaveBeenCalled();
  });

  it("opens an emergency quote request for this home", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Get emergency help" }));
    expect(mockNavigate).toHaveBeenCalledWith("/quotes/new", {
      state: { prefill: { propertyId: "prop-1", urgency: "emergency" } },
    });
  });

  it("shows the storm checklist in a hurricane state and keeps ticks on this device", async () => {
    renderPage();
    const before = await screen.findByRole("region", { name: "Before a storm" });
    expect(within(before).getByText(/hurricane season/i)).toBeInTheDocument();
    const box = within(before).getByRole("checkbox", { name: /Bring in or tie down patio furniture/ });
    fireEvent.click(box);
    expect(box).toBeChecked();
    expect(JSON.parse(localStorage.getItem("hg_storm_prep_prop-1_2026") ?? "[]")).toEqual(["outside"]);
    expect(within(before).getByText(/saved on this device/i)).toBeInTheDocument();
  });

  it("restores this season's ticks", async () => {
    localStorage.setItem("hg_storm_prep_prop-1_2026", JSON.stringify(["shutters"]));
    renderPage();
    const before = await screen.findByRole("region", { name: "Before a storm" });
    expect(within(before).getByRole("checkbox", { name: /Put up shutters/ })).toBeChecked();
  });

  it("walks through after-storm steps into the claim kit, with official sources", async () => {
    renderPage();
    const after = await screen.findByRole("region", { name: "After a storm" });
    expect(within(after).getByText(/Photograph and video the damage/)).toBeInTheDocument();
    expect(within(after).getByRole("link", { name: "Open the claim kit" })).toHaveAttribute(
      "href",
      "/properties/prop-1?tab=insurance",
    );
    expect(screen.getByRole("link", { name: /National Hurricane Center/ })).toHaveAttribute(
      "href",
      "https://www.nhc.noaa.gov/",
    );
    expect(screen.getByRole("link", { name: /Florida county emergency management/ })).toBeInTheDocument();
    expect(screen.getByText(/Follow local emergency officials/)).toBeInTheDocument();
  });

  it("leaves out the storm sections outside hurricane states", async () => {
    svc.getProperty.mockResolvedValue({ ...PROPERTY, state: "CO", city: "Denver", zipCode: "80202" });
    renderPage();
    await screen.findByRole("heading", { name: "Emergency card" });
    expect(screen.queryByRole("region", { name: "Before a storm" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "After a storm" })).not.toBeInTheDocument();
  });

  it("says when the home can't be found", async () => {
    svc.getProperty.mockRejectedValue(new Error("nope"));
    renderPage();
    expect(await screen.findByText("We couldn't find that home.")).toBeInTheDocument();
  });

  it("still shows the card when photos or the policy fail to load", async () => {
    svc.getPhotos.mockRejectedValue(new Error("down"));
    svc.getPolicy.mockRejectedValue(new Error("down"));
    renderPage();
    expect(await screen.findByText("Front yard, by the meter")).toBeInTheDocument();
  });
});
