/**
 * @jest-environment node
 *
 * The phone saves system install years to the same home record as the web
 * (property.setSystemYears), from the add-home form's Original / Replaced step.
 */
const mockActor = { setSystemYears: jest.fn(), getSystemYears: jest.fn() };
jest.mock("../../services/canister", () => ({
  ...jest.requireActual("../../services/canister"),
  actorFor: () => mockActor,
}));

import { SYSTEMS, getSystemYears, saveSystemYears, yearsToSave } from "../../services/systemYearsService";

beforeEach(() => jest.clearAllMocks());

describe("yearsToSave", () => {
  it("turns Original into the build year, keeps replaced years and skips unanswered systems", () => {
    expect(
      yearsToSave(
        {
          HVAC: { choice: "replaced", year: "2019" },
          Roofing: { choice: "original", year: "" },
          Plumbing: { choice: null, year: "" },
        },
        1990,
      ),
    ).toEqual({ HVAC: 2019, Roofing: 1990 });
  });

  it("names a replaced system with no usable year", () => {
    expect(() => yearsToSave({ HVAC: { choice: "replaced", year: "" } }, 1990)).toThrow(
      "Enter the year the HVAC / AC was replaced.",
    );
    expect(() => yearsToSave({ Roofing: { choice: "replaced", year: "1980" } }, 1990)).toThrow(
      "The Roof year can't be before 1990, when the house was built.",
    );
  });

  it("asks about the same systems as the web wizard, plus solar when installed", () => {
    expect(SYSTEMS.map((s) => s.name)).toEqual([
      "HVAC",
      "Roofing",
      "Water Heater",
      "Electrical",
      "Plumbing",
      "Solar Panels",
    ]);
    expect(yearsToSave({ "Solar Panels": { choice: "replaced", year: "2021" } }, 1990)).toEqual({
      "Solar Panels": 2021,
    });
  });

  it("refuses a future year", () => {
    expect(() => yearsToSave({ HVAC: { choice: "replaced", year: "2999" } }, 1990, 2026)).toThrow(
      "The HVAC / AC year can't be after 2026.",
    );
  });
});

describe("saveSystemYears / getSystemYears", () => {
  it("writes the years as whole numbers and reads them back", async () => {
    mockActor.setSystemYears.mockResolvedValue({ ok: [] });
    await saveSystemYears("P1", { HVAC: 2019, Roofing: 1990 });
    expect(mockActor.setSystemYears).toHaveBeenCalledWith("P1", [
      { name: "HVAC", installYear: 2019n },
      { name: "Roofing", installYear: 1990n },
    ]);
    mockActor.getSystemYears.mockResolvedValue({ ok: [{ name: "HVAC", installYear: 2019n }] });
    expect(await getSystemYears("P1")).toEqual({ HVAC: 2019 });
  });

  it("throws the canister's message", async () => {
    mockActor.setSystemYears.mockResolvedValue({ err: { InvalidInput: "The HVAC year is in the future" } });
    await expect(saveSystemYears("P1", { HVAC: 2099 })).rejects.toThrow(/in the future/);
  });
});
