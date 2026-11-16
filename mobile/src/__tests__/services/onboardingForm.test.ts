/**
 * @jest-environment node
 *
 * Signing up and adding a first home in the app: the checks run before
 * anything is sent to the canisters.
 */
import {
  buildPropertyArgs,
  emptyPropertyForm,
  validateNewProperty,
  validateRegistration,
  type NewPropertyForm,
} from "../../services/onboardingForm";

const NOW_YEAR = 2026;
const form = (over: Partial<NewPropertyForm> = {}): NewPropertyForm => ({
  ...emptyPropertyForm(),
  address: "12 Elm St",
  city: "Raleigh",
  state: "nc",
  zipCode: "27601",
  yearBuilt: "1990",
  squareFeet: "1,850",
  ...over,
});

describe("validateRegistration", () => {
  const ok = { role: "Homeowner" as const, email: "dana@example.com", phone: "", agreed: true };
  it("needs a role, a valid email and the terms; phone is optional but must look like one", () => {
    expect(validateRegistration(ok)).toBeNull();
    expect(validateRegistration({ ...ok, role: null })).toBe("Choose how you'll use HomeGentic.");
    expect(validateRegistration({ ...ok, email: "" })).toBe("Enter your email address.");
    expect(validateRegistration({ ...ok, email: "dana@" })).toBe("Enter a valid email address.");
    expect(validateRegistration({ ...ok, phone: "12" })).toBe("Enter a valid phone number, or leave it blank.");
    expect(validateRegistration({ ...ok, phone: "(512) 555-0100" })).toBeNull();
    expect(validateRegistration({ ...ok, agreed: false })).toBe(
      "Agree to the Terms of Service and Privacy Policy to continue.",
    );
  });
});

describe("validateNewProperty", () => {
  it("accepts a complete form", () => {
    expect(validateNewProperty(form(), NOW_YEAR)).toBeNull();
  });

  it("names the first thing to fix", () => {
    expect(validateNewProperty(form({ address: " " }), NOW_YEAR)).toBe("Enter the street address.");
    expect(validateNewProperty(form({ city: "" }), NOW_YEAR)).toBe("Enter the city.");
    expect(validateNewProperty(form({ state: "XX" }), NOW_YEAR)).toBe("Use the two-letter state, like FL.");
    expect(validateNewProperty(form({ zipCode: "2760" }), NOW_YEAR)).toBe("Enter a 5-digit ZIP code.");
    expect(validateNewProperty(form({ yearBuilt: "1700" }), NOW_YEAR)).toBe(
      "Enter the year the house was built, between 1800 and 2026.",
    );
    expect(validateNewProperty(form({ yearBuilt: "2027" }), NOW_YEAR)).toBe(
      "Enter the year the house was built, between 1800 and 2026.",
    );
    expect(validateNewProperty(form({ squareFeet: "0" }), NOW_YEAR)).toBe("Enter the square footage.");
  });
});

describe("buildPropertyArgs", () => {
  it("trims, upper-cases the state and turns numbers into whole numbers", () => {
    expect(buildPropertyArgs(form({ address: " 12 Elm St ", propertyType: "Condo" }), "Pro")).toEqual({
      address: "12 Elm St",
      city: "Raleigh",
      state: "NC",
      zipCode: "27601",
      propertyType: "Condo",
      yearBuilt: 1990,
      squareFeet: 1850,
      tier: "Pro",
    });
  });

  it("starts a new form as a single-family home", () => {
    expect(emptyPropertyForm().propertyType).toBe("SingleFamily");
  });
});
