/**
 * MoveInPlanPage (#712): a new owner's first-weeks checklist, built from the
 * home's records, plus tasks they pick from their purchase inspection report.
 */
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import type { MoveInPlan } from "@/services/moveInPlan";

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
const { mockToast } = vi.hoisted(() => ({ mockToast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("react-hot-toast", () => ({ default: mockToast }));
vi.mock("@/store/authStore", () => ({
  useAuthStore: (sel: any) => sel({ principal: "owner-principal" }),
}));

const { svc } = vi.hoisted(() => ({
  svc: {
    get: vi.fn(),
    start: vi.fn(),
    setStep: vi.fn(),
    addTasks: vi.fn(),
    deleteTask: vi.fn(),
    end: vi.fn(),
    readInspection: vi.fn(),
    getProperty: vi.fn(),
    getAccessRole: vi.fn(),
    getGuide: vi.fn(),
    getPolicy: vi.fn(),
    getRooms: vi.fn(),
    checkRecalls: vi.fn(),
    upload: vi.fn(),
  },
}));
vi.mock("@/services/moveInPlan", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/moveInPlan")>();
  return {
    ...actual,
    moveInPlanService: {
      get: svc.get,
      start: svc.start,
      setStep: svc.setStep,
      addTasks: svc.addTasks,
      deleteTask: svc.deleteTask,
      end: svc.end,
    },
    readInspection: svc.readInspection,
  };
});
vi.mock("@/services/property", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/property")>();
  return { ...actual, propertyService: { getProperty: svc.getProperty, getAccessRole: svc.getAccessRole } };
});
vi.mock("@/services/houseGuide", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/houseGuide")>();
  return { ...actual, houseGuideService: { get: svc.getGuide } };
});
vi.mock("@/services/insurancePolicy", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/insurancePolicy")>();
  return { ...actual, insurancePolicyService: { get: svc.getPolicy } };
});
vi.mock("@/services/room", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/room")>();
  return { ...actual, roomService: { getRoomsByProperty: svc.getRooms } };
});
vi.mock("@/services/recalls", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/recalls")>();
  return { ...actual, checkRecalls: svc.checkRecalls };
});
vi.mock("@/services/photo", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/photo")>();
  return { ...actual, photoService: { upload: svc.upload } };
});

import MoveInPlanPage from "@/pages/MoveInPlanPage";

const PROPERTY = {
  id: "prop-1",
  address: "40 Lake Dr",
  city: "Orlando",
  state: "FL",
  zipCode: "32801",
  yearBuilt: 1998,
};
const plan = (over: Partial<MoveInPlan> = {}): MoveInPlan => ({
  startedAt: Date.UTC(2026, 10, 7),
  doneSteps: [],
  tasks: [],
  updatedAt: Date.UTC(2026, 10, 7),
  ...over,
});

function renderPage() {
  return render(
    <MemoryRouter>
      <MoveInPlanPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  svc.getProperty.mockResolvedValue(PROPERTY);
  svc.getAccessRole.mockResolvedValue("Owner");
  svc.getGuide.mockResolvedValue(null);
  svc.getPolicy.mockResolvedValue(null);
  svc.getRooms.mockResolvedValue([]);
  svc.checkRecalls.mockResolvedValue([]);
  svc.get.mockResolvedValue(plan());
  svc.setStep.mockImplementation(async (_p: string, id: string, done: boolean) =>
    plan({ doneSteps: done ? [id] : [] }),
  );
});

describe("MoveInPlanPage", () => {
  it("lists the steps with progress and the copy limits", async () => {
    renderPage();
    expect(await screen.findByRole("heading", { name: "Move-in plan" })).toBeInTheDocument();
    expect(screen.getByText("40 Lake Dr, Orlando, FL 32801")).toBeInTheDocument();
    expect(screen.getByText("Change or rekey the locks")).toBeInTheDocument();
    expect(screen.getByText("File for the Florida homestead exemption")).toBeInTheDocument();
    expect(screen.getByTestId("move-in-progress")).toHaveTextContent("0 of 10 done");
    expect(screen.getByText(/suggestions, not an inspection/i)).toBeInTheDocument();
  });

  it("ticks a step off", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("checkbox", { name: "Change or rekey the locks" }));
    await waitFor(() => expect(svc.setStep).toHaveBeenCalledWith("prop-1", "locks", true));
    await waitFor(() => expect(screen.getByTestId("move-in-progress")).toHaveTextContent("1 of 10 done"));
  });

  it("shows a step the record already covers as done, with the reason", async () => {
    svc.getPolicy.mockResolvedValue({ carrier: "Citizens" });
    renderPage();
    const box = await screen.findByRole("checkbox", { name: "Put your home insurance on record" });
    await waitFor(() => expect(box).toBeChecked());
    expect(box).toBeDisabled();
    expect(screen.getByText("Policy with Citizens on record")).toBeInTheDocument();
  });

  it("offers to start a plan when the home has none", async () => {
    svc.get.mockResolvedValue(null);
    svc.start.mockResolvedValue(plan());
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Start a move-in plan" }));
    await waitFor(() => expect(svc.start).toHaveBeenCalledWith("prop-1"));
    expect(await screen.findByText("Change or rekey the locks")).toBeInTheDocument();
  });

  it("is read-only for a viewer", async () => {
    svc.getAccessRole.mockResolvedValue("Viewer");
    renderPage();
    expect(await screen.findByRole("checkbox", { name: "Change or rekey the locks" })).toBeDisabled();
    expect(screen.queryByLabelText(/inspection report file/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "End the plan" })).not.toBeInTheDocument();
  });

  it("tells a viewer when there's no plan instead of offering one", async () => {
    svc.get.mockResolvedValue(null);
    svc.getAccessRole.mockResolvedValue("Viewer");
    renderPage();
    expect(await screen.findByText(/no move-in plan/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start a move-in plan" })).not.toBeInTheDocument();
  });

  it("reads an inspection report and adds the findings the owner keeps", async () => {
    svc.readInspection.mockResolvedValue({
      isInspectionReport: true,
      findings: [
        { title: "GFCI by sink doesn't trip", detail: "Kitchen", area: "Electrical", urgency: "safety" },
        { title: "Clean dryer vent", detail: "", area: "Appliances", urgency: "repair" },
      ],
    });
    svc.upload.mockResolvedValue({});
    svc.addTasks.mockResolvedValue(
      plan({
        tasks: [
          {
            id: "mt-1",
            title: "GFCI by sink doesn't trip",
            detail: "Kitchen",
            area: "Electrical",
            urgency: "safety",
            createdAt: 1,
          },
        ],
      }),
    );
    renderPage();
    const file = new File(["%PDF"], "inspection.pdf", { type: "application/pdf" });
    fireEvent.change(await screen.findByLabelText(/inspection report file/i), { target: { files: [file] } });

    const review = await screen.findByTestId("inspection-review");
    expect(within(review).getByText(/read by AI/i)).toBeInTheDocument();
    expect(within(review).getByText(/check each item against the report/i)).toBeInTheDocument();
    fireEvent.click(within(review).getByRole("checkbox", { name: "Clean dryer vent" }));
    fireEvent.click(within(review).getByRole("button", { name: "Add 1 task" }));

    await waitFor(() =>
      expect(svc.addTasks).toHaveBeenCalledWith("prop-1", [
        { title: "GFCI by sink doesn't trip", detail: "Kitchen", area: "Electrical", urgency: "safety" },
      ]),
    );
    // The report is filed in the home's documents too (the box is on by default).
    expect(svc.upload).toHaveBeenCalledWith(
      file,
      "docs_prop-1",
      "prop-1",
      "PostConstruction",
      "[Inspection] inspection.pdf",
    );
    expect(await screen.findByText("GFCI by sink doesn't trip")).toBeInTheDocument();
    expect(screen.queryByTestId("inspection-review")).not.toBeInTheDocument();
  });

  it("says so when the file isn't an inspection report", async () => {
    svc.readInspection.mockResolvedValue({ isInspectionReport: false, findings: [] });
    renderPage();
    fireEvent.change(await screen.findByLabelText(/inspection report file/i), {
      target: { files: [new File(["x"], "menu.png", { type: "image/png" })] },
    });
    expect(await screen.findByText(/doesn't look like an inspection report/i)).toBeInTheDocument();
    expect(svc.addTasks).not.toHaveBeenCalled();
  });

  it("shows the reader's error", async () => {
    svc.readInspection.mockRejectedValue(new Error("That PDF is over 1.5 MB."));
    renderPage();
    fireEvent.change(await screen.findByLabelText(/inspection report file/i), {
      target: { files: [new File(["x"], "big.pdf", { type: "application/pdf" })] },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("That PDF is over 1.5 MB.");
  });

  it("ticks, deletes and gets quotes for a task", async () => {
    const task = {
      id: "mt-1",
      title: "Repair flashing",
      detail: "At chimney",
      area: "Roof",
      urgency: "repair" as const,
      createdAt: 1,
    };
    svc.get.mockResolvedValue(plan({ tasks: [task] }));
    svc.setStep.mockResolvedValue(plan({ tasks: [task], doneSteps: ["mt-1"] }));
    svc.deleteTask.mockResolvedValue(plan());
    renderPage();
    expect(await screen.findByTestId("move-in-progress")).toHaveTextContent("0 of 11 done");

    fireEvent.click(screen.getByRole("button", { name: "Get quotes for Repair flashing" }));
    expect(mockNavigate).toHaveBeenCalledWith("/quotes/new", {
      state: {
        prefill: {
          propertyId: "prop-1",
          serviceType: "Roofing",
          description: "Repair flashing. At chimney (from my purchase inspection)",
        },
      },
    });

    fireEvent.click(screen.getByRole("checkbox", { name: "Repair flashing" }));
    await waitFor(() => expect(svc.setStep).toHaveBeenCalledWith("prop-1", "mt-1", true));
    // A finished task needs no quotes.
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Get quotes for Repair flashing" })).not.toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete Repair flashing" }));
    await waitFor(() => expect(svc.deleteTask).toHaveBeenCalledWith("prop-1", "mt-1"));
  });

  it("ends the plan after a confirm", async () => {
    svc.end.mockResolvedValue(undefined);
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "End the plan" }));
    fireEvent.click(await screen.findByRole("button", { name: "Yes, end it" }));
    await waitFor(() => expect(svc.end).toHaveBeenCalledWith("prop-1"));
    expect(mockNavigate).toHaveBeenCalledWith("/properties/prop-1");
  });

  it("shows a possible recall from the appliance check", async () => {
    svc.getRooms.mockResolvedValue([
      {
        id: "r",
        name: "Kitchen",
        fixtures: [
          { id: "f", brand: "LG", model: "LRM1", serialNumber: "", installedDate: "", warrantyExpiry: "", notes: "" },
        ],
      },
    ]);
    svc.checkRecalls.mockResolvedValue([
      {
        brand: "LG",
        model: "LRM1",
        recalls: [
          {
            id: "1",
            number: "1",
            date: "2024-01-01",
            title: "Fridge fire",
            url: "https://cpsc.gov/x",
            hazard: "",
            remedy: "",
          },
        ],
      },
    ]);
    renderPage();
    expect(await screen.findByText(/may cover your LG LRM1/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Read the CPSC notice" })).toHaveAttribute("href", "https://cpsc.gov/x");
  });
});
