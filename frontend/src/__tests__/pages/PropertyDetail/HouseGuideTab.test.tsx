import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { HouseGuide, GuideLink } from "@/services/houseGuide";
import type { Photo } from "@/services/photo";

const { svc, mockGetAccessRole, mockToast } = vi.hoisted(() => ({
  svc: {
    get: vi.fn(),
    save: vi.fn(),
    createLink: vi.fn(),
    listLinks: vi.fn(),
    revokeLink: vi.fn(),
  },
  mockGetAccessRole: vi.fn(),
  mockToast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/services/houseGuide", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/houseGuide")>()),
  houseGuideService: svc,
}));
vi.mock("@/services/property", () => ({ propertyService: { getAccessRole: mockGetAccessRole } }));
vi.mock("@/store/authStore", () => ({
  useAuthStore: (sel: (s: { principal: string }) => unknown) => sel({ principal: "me" }),
}));
vi.mock("react-hot-toast", () => ({ default: mockToast }));

import { HouseGuideTab } from "@/pages/PropertyDetail/HouseGuideTab";
import { EMPTY_GUIDE } from "@/services/houseGuide";

const NOW = Date.UTC(2026, 10, 7, 15);
const GUIDE: HouseGuide = {
  ...EMPTY_GUIDE,
  wifiName: "Lake House",
  wifiPassword: "correct horse",
  alarm: "Code 4821",
  waterShutoff: "Garage, red handle",
  contacts: [{ name: "Ana", role: "Spare key", phone: "407-555-0142" }],
  photoIds: ["ph-shutoff"],
};
const photo = (id: string, jobId: string, description: string): Photo => ({
  id,
  jobId,
  propertyId: "p1",
  phase: "PostConstruction",
  description,
  hash: "h",
  url: `blob:${id}`,
  size: 10,
  verified: false,
  createdAt: 0,
});
const PHOTOS = [
  photo("ph-shutoff", "baseline_p1", "shutoff"),
  photo("ph-panel", "baseline_p1", "electrical"),
  photo("ph-job", "job-1", "Before"),
];
const LINK: GuideLink = {
  token: "a".repeat(64),
  name: "Cat sitter",
  createdAt: NOW,
  expiresAt: NOW + 7 * 86_400_000,
  revoked: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(NOW));
  mockGetAccessRole.mockResolvedValue("Owner");
  svc.get.mockResolvedValue(null);
  svc.save.mockResolvedValue(undefined);
  svc.listLinks.mockResolvedValue([]);
  svc.createLink.mockResolvedValue(LINK);
  svc.revokeLink.mockResolvedValue(undefined);
});
afterEach(() => vi.useRealTimers());

describe("HouseGuideTab", () => {
  it("says up front that the guide is stored as typed and readable by anyone with a link", async () => {
    render(<HouseGuideTab propertyId="p1" photos={PHOTOS} />);
    await screen.findByLabelText("Wi-Fi network");
    expect(screen.getByText(/stored exactly as you type/i)).toBeInTheDocument();
    expect(screen.getByText(/anyone with a link can read everything in it/i)).toBeInTheDocument();
  });

  it("lets the owner write the guide, with onboarding photos, then shows it", async () => {
    render(<HouseGuideTab propertyId="p1" photos={PHOTOS} />);
    fireEvent.change(await screen.findByLabelText("Wi-Fi network"), { target: { value: "Lake House" } });
    fireEvent.change(screen.getByLabelText("Wi-Fi password"), { target: { value: "correct horse" } });
    fireEvent.change(screen.getByLabelText("Alarm"), { target: { value: "Code 4821" } });
    fireEvent.change(screen.getByLabelText("Water shutoff"), { target: { value: "Garage, red handle" } });
    fireEvent.click(screen.getByRole("button", { name: "Add a contact" }));
    fireEvent.change(screen.getByLabelText("Contact 1 name"), { target: { value: "Ana" } });
    fireEvent.change(screen.getByLabelText("Contact 1 role"), { target: { value: "Spare key" } });
    fireEvent.change(screen.getByLabelText("Contact 1 phone"), { target: { value: "407-555-0142" } });
    // Only the onboarding (baseline) photos are offered, by what they show.
    expect(screen.queryByLabelText(/Before/)).toBeNull();
    fireEvent.click(screen.getByLabelText("Show photo: Main water shut-off valve"));
    fireEvent.click(screen.getByRole("button", { name: "Save guide" }));

    await waitFor(() => expect(svc.save).toHaveBeenCalledWith("p1", GUIDE));
    expect(mockToast.success).toHaveBeenCalledWith("Guide saved");
    expect(await screen.findByText("correct horse")).toBeInTheDocument();
    expect(screen.getByText("Ana")).toBeInTheDocument();
    expect(screen.getByAltText("Main water shut-off valve")).toHaveAttribute("src", "blob:ph-shutoff");
  });

  it("refuses an empty guide without calling the canister", async () => {
    render(<HouseGuideTab propertyId="p1" photos={[]} />);
    fireEvent.click(await screen.findByRole("button", { name: "Save guide" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/at least one/i);
    expect(svc.save).not.toHaveBeenCalled();
  });

  it("shows an error toast when saving fails", async () => {
    svc.save.mockRejectedValue(new Error("boom"));
    render(<HouseGuideTab propertyId="p1" photos={[]} />);
    fireEvent.change(await screen.findByLabelText("Trash day"), { target: { value: "Tuesday" } });
    fireEvent.click(screen.getByRole("button", { name: "Save guide" }));
    await waitFor(() => expect(mockToast.error).toHaveBeenCalled());
  });

  it("creates, copies and revokes share links", async () => {
    svc.get.mockResolvedValue(GUIDE);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<HouseGuideTab propertyId="p1" photos={PHOTOS} />);

    fireEvent.change(await screen.findByLabelText("Who is it for?"), { target: { value: "Cat sitter" } });
    fireEvent.change(screen.getByLabelText("Link lasts"), { target: { value: "7" } });
    fireEvent.click(screen.getByRole("button", { name: "Create link" }));
    await waitFor(() => expect(svc.createLink).toHaveBeenCalledWith("p1", "Cat sitter", 7));

    const row = (await screen.findByText("Cat sitter")).closest("li")!;
    expect(within(row).getByText(/works until/i)).toBeInTheDocument();
    const url = `${window.location.origin}/guide/${LINK.token}`;
    expect(within(row).getByDisplayValue(url)).toBeInTheDocument();
    fireEvent.click(within(row).getByRole("button", { name: "Copy link" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(url));

    fireEvent.click(within(row).getByRole("button", { name: "Turn off" }));
    await waitFor(() => expect(svc.revokeLink).toHaveBeenCalledWith(LINK.token));
    expect(await within(row).findByText("Turned off")).toBeInTheDocument();
  });

  it("lets the owner remove the guide, which ends its links", async () => {
    svc.get.mockResolvedValue(GUIDE);
    render(<HouseGuideTab propertyId="p1" photos={PHOTOS} />);
    fireEvent.click(await screen.findByRole("button", { name: "Remove" }));
    expect(screen.getByText(/every link to it stops working/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Yes, remove" }));
    await waitFor(() => expect(svc.save).toHaveBeenCalledWith("p1", null));
  });

  it("lets the owner edit the saved guide", async () => {
    svc.get.mockResolvedValue(GUIDE);
    render(<HouseGuideTab propertyId="p1" photos={PHOTOS} />);
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    expect(screen.getByLabelText("Wi-Fi network")).toHaveValue("Lake House");
    fireEvent.click(screen.getByRole("button", { name: "Remove contact 1" }));
    fireEvent.click(screen.getByLabelText("Show photo: Main water shut-off valve"));
    fireEvent.click(screen.getByRole("button", { name: "Save guide" }));
    await waitFor(() => expect(svc.save).toHaveBeenCalledWith("p1", { ...GUIDE, contacts: [], photoIds: [] }));
  });

  it("shows viewers the guide but not the links or edit controls", async () => {
    mockGetAccessRole.mockResolvedValue("Viewer");
    svc.get.mockResolvedValue(GUIDE);
    render(<HouseGuideTab propertyId="p1" photos={PHOTOS} />);
    expect(await screen.findByText("Lake House")).toBeInTheDocument();
    await waitFor(() => expect(mockGetAccessRole).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(screen.queryByLabelText("Who is it for?")).toBeNull();
    expect(svc.listLinks).not.toHaveBeenCalled();
  });

  it("offers a retry when the guide can't be loaded", async () => {
    svc.get.mockRejectedValueOnce(new Error("down"));
    render(<HouseGuideTab propertyId="p1" photos={[]} />);
    fireEvent.click(await screen.findByRole("button", { name: /try again/i }));
    expect(await screen.findByLabelText("Wi-Fi network")).toBeInTheDocument();
  });
});
