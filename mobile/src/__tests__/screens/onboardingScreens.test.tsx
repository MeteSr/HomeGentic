/**
 * #7 first week on the phone: a new member signs up and adds their first
 * home in the app, without a trip to homegentic.app.
 */
import React from "react";
import { Alert } from "react-native";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

const mockComplete = jest.fn();
const mockLogout = jest.fn();
jest.mock("../../auth/AuthContext", () => ({
  useAuthContext: () => ({ completeRegistration: mockComplete, logout: mockLogout }),
}));

const mockRefresh = jest.fn(async () => undefined);
const mockSetActive = jest.fn();
let mockTier = "Free";
let mockPro = false;
let mockCount = 0;
jest.mock("../../context/AppData", () => ({
  useAppData: () => ({
    tier: mockTier,
    pro: mockPro,
    limits: { propertyLimit: 1 },
    properties: Array.from({ length: mockCount }, (_, i) => ({ id: `p${i}` })),
    propertiesError: false,
    refreshProperties: mockRefresh,
    setActivePropertyId: mockSetActive,
  }),
}));

const mockRegisterProperty = jest.fn();
const mockStartMoveIn = jest.fn();
jest.mock("../../services/propertyService", () => ({
  ...jest.requireActual("../../services/propertyService"),
  registerProperty: (...a: unknown[]) => mockRegisterProperty(...a),
  startMoveInPlan: (...a: unknown[]) => mockStartMoveIn(...a),
}));

const mockSuggest = jest.fn();
const mockPlace = jest.fn();
const mockLookup = jest.fn();
jest.mock("../../services/propertyLookupService", () => ({
  newAddressSessionToken: () => "sess",
  suggestAddresses: (...a: unknown[]) => mockSuggest(...a),
  placeAddress: (...a: unknown[]) => mockPlace(...a),
  lookupPropertyDetails: (...a: unknown[]) => mockLookup(...a),
}));

const mockSaveYears = jest.fn();
jest.mock("../../services/systemYearsService", () => ({
  ...jest.requireActual("../../services/systemYearsService"),
  saveSystemYears: (...a: unknown[]) => mockSaveYears(...a),
}));

const mockNavigate = jest.fn();
jest.mock("@react-navigation/native", () => ({
  ...jest.requireActual("@react-navigation/native"),
  useNavigation: () => ({ navigate: mockNavigate }),
}));

import RegisterScreen from "../../screens/RegisterScreen";
import AddPropertyScreen from "../../screens/v3/AddPropertyScreen";
import { NoProperty } from "../../screens/v3/NoProperty";

const wrap = (el: React.ReactElement) =>
  render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      {el}
    </SafeAreaProvider>,
  );

jest.setTimeout(20_000);

beforeEach(() => {
  jest.clearAllMocks();
  mockTier = "Free";
  mockPro = false;
  mockCount = 0;
  jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
  mockSuggest.mockResolvedValue([]);
  mockLookup.mockResolvedValue(null);
  mockSaveYears.mockResolvedValue(undefined);
  mockStartMoveIn.mockResolvedValue(undefined);
});

describe("RegisterScreen", () => {
  it("signs up with the chosen role, email and phone once the terms are agreed", async () => {
    mockComplete.mockResolvedValue(undefined);
    await wrap(<RegisterScreen />);
    expect(screen.getByRole("radio", { name: /Homeowner/ })).toHaveProp("accessibilityState", { selected: true });
    await fireEvent.press(screen.getByRole("radio", { name: /Contractor/ }));
    await fireEvent.changeText(screen.getByLabelText("Email"), " pro@example.com ");
    await fireEvent.changeText(screen.getByLabelText("Phone (optional)"), "512-555-0100");
    await fireEvent.press(screen.getByRole("checkbox", { name: /Terms of Service/ }));
    await fireEvent.press(screen.getByRole("button", { name: "Create account" }));
    await waitFor(() =>
      expect(mockComplete).toHaveBeenCalledWith({
        role: "Contractor",
        email: "pro@example.com",
        phone: "512-555-0100",
      }),
    );
  });

  it("says what's missing and sends nothing", async () => {
    await wrap(<RegisterScreen />);
    await fireEvent.changeText(screen.getByLabelText("Email"), "pro@example.com");
    await fireEvent.press(screen.getByRole("button", { name: "Create account" }));
    expect(Alert.alert).toHaveBeenCalledWith(
      "Almost there",
      "Agree to the Terms of Service and Privacy Policy to continue.",
    );
    expect(mockComplete).not.toHaveBeenCalled();
  });

  it("shows the canister's reason when sign-up fails, and can sign out instead", async () => {
    mockComplete.mockRejectedValue(
      Object.assign(new Error("That email is already in use"), { name: "CanisterError", code: "InvalidInput" }),
    );
    await wrap(<RegisterScreen />);
    await fireEvent.changeText(screen.getByLabelText("Email"), "dana@example.com");
    await fireEvent.press(screen.getByRole("checkbox", { name: /Terms of Service/ }));
    await fireEvent.press(screen.getByRole("button", { name: "Create account" }));
    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith("Couldn't create your account", expect.stringMatching(/already in use/)),
    );
    await fireEvent.press(screen.getByRole("button", { name: "Sign out" }));
    expect(mockLogout).toHaveBeenCalled();
  });
});

async function fill() {
  await fireEvent.changeText(screen.getByLabelText("Street address"), "12 Elm St");
  await fireEvent.changeText(screen.getByLabelText("City"), "Raleigh");
  await fireEvent.changeText(screen.getByLabelText("State"), "nc");
  await fireEvent.changeText(screen.getByLabelText("ZIP code"), "27601");
  await fireEvent.changeText(screen.getByLabelText("Year built"), "1990");
  await fireEvent.changeText(screen.getByLabelText("Square feet"), "1850");
}

describe("AddPropertyScreen", () => {
  const navigation = { goBack: jest.fn(), navigate: jest.fn() } as any;
  const route = { key: "k", name: "AddProperty", params: undefined } as any;

  it("saves the home, makes it the active one, and then asks about system years", async () => {
    mockRegisterProperty.mockResolvedValue({ id: "P9" });
    await wrap(<AddPropertyScreen navigation={navigation} route={route} />);
    await fill();
    await fireEvent.press(screen.getByRole("radio", { name: "Townhouse" }));
    await fireEvent.press(screen.getByRole("button", { name: "Save home" }));
    expect(await screen.findByText("How old are your systems?")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Skip for now" }));
    expect(navigation.goBack).toHaveBeenCalled();
    expect(mockSaveYears).not.toHaveBeenCalled();
    expect(mockStartMoveIn).not.toHaveBeenCalled();
    expect(mockRegisterProperty).toHaveBeenCalledWith({
      address: "12 Elm St",
      city: "Raleigh",
      state: "NC",
      zipCode: "27601",
      propertyType: "Townhouse",
      yearBuilt: 1990,
      squareFeet: 1850,
      tier: "Free",
    });
    expect(mockRefresh).toHaveBeenCalled();
    expect(mockSetActive).toHaveBeenCalledWith("P9");
  });

  it("checks the form first, and keeps it open when the canister refuses", async () => {
    await wrap(<AddPropertyScreen navigation={navigation} route={route} />);
    await fireEvent.press(screen.getByRole("button", { name: "Save home" }));
    expect(Alert.alert).toHaveBeenCalledWith("Almost there", "Enter the street address.");
    expect(mockRegisterProperty).not.toHaveBeenCalled();

    mockRegisterProperty.mockRejectedValue(
      Object.assign(new Error("This address is already registered"), { name: "CanisterError", code: "InvalidInput" }),
    );
    await fill();
    await fireEvent.press(screen.getByRole("button", { name: "Save home" }));
    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith("Couldn't add the home", expect.stringMatching(/already registered/)),
    );
    expect(navigation.goBack).not.toHaveBeenCalled();
  });
});

describe("AddPropertyScreen — like the web wizard", () => {
  const navigation = { goBack: jest.fn(), navigate: jest.fn() } as any;
  const route = { key: "k", name: "AddProperty", params: undefined } as any;

  it("suggests addresses, fills the rest from the pick and pre-fills details from public records", async () => {
    mockSuggest.mockResolvedValue([{ placeId: "pl1", main: "12 Elm St", secondary: "Raleigh, NC, USA" }]);
    mockPlace.mockResolvedValue({ address: "12 Elm St", city: "Raleigh", state: "NC", zipCode: "27601" });
    mockLookup.mockResolvedValue({ yearBuilt: 1994, squareFeet: 1850, propertyType: "Condo" });
    await wrap(<AddPropertyScreen navigation={navigation} route={route} />);
    await fireEvent.changeText(screen.getByLabelText("Street address"), "12 Elm");
    await fireEvent.press(await screen.findByRole("button", { name: "12 Elm St, Raleigh, NC, USA" }));
    await waitFor(() => expect(screen.getByLabelText("ZIP code")).toHaveProp("value", "27601"));
    expect(screen.getByLabelText("City")).toHaveProp("value", "Raleigh");
    expect(screen.getByLabelText("State")).toHaveProp("value", "NC");
    expect(mockPlace).toHaveBeenCalledWith("pl1", "sess");
    await waitFor(() => expect(screen.getByLabelText("Year built")).toHaveProp("value", "1994"));
    expect(screen.getByLabelText("Square feet")).toHaveProp("value", "1850");
    expect(screen.getByRole("radio", { name: "Condo" })).toHaveProp("accessibilityState", { selected: true });
    expect(screen.getByText(/Filled in from public records/)).toBeTruthy();
    expect(mockLookup).toHaveBeenCalledWith({ address: "12 Elm St", city: "Raleigh", state: "NC", zipCode: "27601" });
  });

  it("saves Original and Replaced years to the home record, then goes back", async () => {
    mockRegisterProperty.mockResolvedValue({ id: "P9", yearBuilt: 1990 });
    await wrap(<AddPropertyScreen navigation={navigation} route={route} />);
    await fireEvent.changeText(screen.getByLabelText("Street address"), "12 Elm St");
    await fireEvent.changeText(screen.getByLabelText("City"), "Raleigh");
    await fireEvent.changeText(screen.getByLabelText("State"), "NC");
    await fireEvent.changeText(screen.getByLabelText("ZIP code"), "27601");
    await fireEvent.changeText(screen.getByLabelText("Year built"), "1990");
    await fireEvent.changeText(screen.getByLabelText("Square feet"), "1850");
    await fireEvent.press(screen.getByRole("button", { name: "Save home" }));
    await screen.findByText("How old are your systems?");

    await fireEvent.press(screen.getByRole("radio", { name: "HVAC / AC: Replaced" }));
    await fireEvent.changeText(screen.getByLabelText("Year the HVAC / AC was replaced"), "2019");
    await fireEvent.press(screen.getByRole("radio", { name: "Roof: Original" }));
    await fireEvent.press(screen.getByRole("button", { name: "Save years" }));
    await waitFor(() => expect(mockSaveYears).toHaveBeenCalledWith("P9", { HVAC: 2019, Roofing: 1990 }));
    await waitFor(() => expect(navigation.goBack).toHaveBeenCalled());
  });

  it("keeps the years step open with the reason when a year is wrong or the record refuses it", async () => {
    mockRegisterProperty.mockResolvedValue({ id: "P9", yearBuilt: 1990 });
    await wrap(<AddPropertyScreen navigation={navigation} route={route} />);
    await fill();
    await fireEvent.press(screen.getByRole("button", { name: "Save home" }));
    await screen.findByText("How old are your systems?");
    await fireEvent.press(screen.getByRole("radio", { name: "HVAC / AC: Replaced" }));
    await fireEvent.press(screen.getByRole("button", { name: "Save years" }));
    expect(Alert.alert).toHaveBeenCalledWith("Almost there", "Enter the year the HVAC / AC was replaced.");
    expect(mockSaveYears).not.toHaveBeenCalled();

    mockSaveYears.mockRejectedValueOnce(
      Object.assign(new Error("The HVAC year is in the future"), { name: "CanisterError", code: "InvalidInput" }),
    );
    await fireEvent.changeText(screen.getByLabelText("Year the HVAC / AC was replaced"), "2019");
    await fireEvent.press(screen.getByRole("button", { name: "Save years" }));
    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith("Couldn't save the years", expect.stringMatching(/in the future/)),
    );
    expect(navigation.goBack).not.toHaveBeenCalled();
  });

  it("starts the move-in plan when the home was bought in the last 12 months", async () => {
    mockRegisterProperty.mockResolvedValue({ id: "P9", yearBuilt: 1990 });
    await wrap(<AddPropertyScreen navigation={navigation} route={route} />);
    await fill();
    await fireEvent.press(screen.getByRole("radio", { name: "Bought in the last 12 months: Yes" }));
    await fireEvent.press(screen.getByRole("button", { name: "Save home" }));
    await screen.findByText("How old are your systems?");
    expect(mockStartMoveIn).toHaveBeenCalledWith("P9");
  });
});

describe("NoProperty", () => {
  it("opens the in-app add-home form", async () => {
    await wrap(<NoProperty />);
    await fireEvent.press(screen.getByRole("button", { name: /Add a property/ }));
    expect(mockNavigate).toHaveBeenCalledWith("AddProperty");
  });
});
