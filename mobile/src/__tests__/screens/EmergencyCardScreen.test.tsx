/**
 * #715: the emergency card on the phone, including when it opens from the
 * copy saved on the phone because the network is down.
 */
import React from "react";
import { Linking } from "react-native";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { buildEmergencyCard } from "@homegentic/shared/emergency";

// useLoad reloads on focus; outside a navigator, run it once on mount.
jest.mock("@react-navigation/native", () => {
  const { useEffect } = jest.requireActual("react");
  return { ...jest.requireActual("@react-navigation/native"), useFocusEffect: (cb: () => void) => useEffect(cb, [cb]) };
});
jest.mock("../../auth/AuthContext", () => ({
  useAuthContext: () => ({ authState: { status: "authenticated", principal: "p-1" } }),
}));
const mockLoad = jest.fn();
jest.mock("../../services/emergencyCardService", () => ({
  loadEmergencyCard: (...args: unknown[]) => mockLoad(...args),
}));

import EmergencyCardScreen from "../../screens/v3/EmergencyCardScreen";

const CARD = buildEmergencyCard({
  guide: {
    waterShutoff: "Front yard, by the meter",
    gasShutoff: "",
    electricPanel: "Garage",
    alarm: "ADT keypad by the door",
    contacts: [
      { name: "Citizens claims", role: "Insurance claims", phone: "866-411-2742" },
      { name: "Bob's Plumbing", role: "Plumber", phone: "407-555-0199" },
    ],
    photoIds: [],
  },
  policy: { carrier: "Citizens", policyNumber: "FL-123" },
  photos: [],
});

const navigation = { goBack: jest.fn(), navigate: jest.fn() } as any;
const route = (state = "FL") =>
  ({
    key: "k",
    name: "EmergencyCard",
    params: { propertyId: "p1", propertyAddress: "40 Lake Dr, Orlando, FL", state },
  }) as any;

function renderScreen(state?: string) {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <EmergencyCardScreen navigation={navigation} route={route(state)} />
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockLoad.mockResolvedValue({ card: CARD, savedAt: Date.UTC(2026, 8, 1), fromPhone: false });
  jest.spyOn(Linking, "openURL").mockResolvedValue(true as any);
});

// The first render pulls in react-native's lazily-required components
// (ScrollView, RefreshControl, Pressable…), which a cold jest cache transforms
// on the spot: several seconds on a loaded CI runner, past jest's 5s default.
jest.setTimeout(20_000);

describe("EmergencyCardScreen", () => {
  it("loads this person's card for the home and shows the shutoffs, insurer and contacts", async () => {
    await renderScreen();
    expect(await screen.findByText("Front yard, by the meter")).toBeTruthy();
    expect(mockLoad).toHaveBeenCalledWith("p1", "p-1");
    expect(screen.getByText("Garage")).toBeTruthy();
    expect(screen.getByText("Not written down yet")).toBeTruthy();
    expect(screen.getByText("ADT keypad by the door")).toBeTruthy();
    expect(screen.getByText("Citizens")).toBeTruthy();
    expect(screen.getByText("FL-123")).toBeTruthy();
    expect(screen.getByText("Bob's Plumbing")).toBeTruthy();
  });

  it("calls the claim line and contacts", async () => {
    await renderScreen();
    await fireEvent.press(await screen.findByLabelText("Call the claim line 866-411-2742"));
    expect(Linking.openURL).toHaveBeenCalledWith("tel:8664112742");
    await fireEvent.press(screen.getByLabelText("Call Bob's Plumbing 407-555-0199"));
    expect(Linking.openURL).toHaveBeenCalledWith("tel:4075550199");
  });

  it("says when it is the copy saved on the phone", async () => {
    mockLoad.mockResolvedValue({ card: { ...CARD, alarm: "" }, savedAt: Date.UTC(2026, 8, 1, 12), fromPhone: true });
    await renderScreen();
    expect(await screen.findByText(/You're offline\. This is the copy saved on this phone on Sep 1/)).toBeTruthy();
    expect(screen.getByText(/Alarm notes aren't kept on the phone/)).toBeTruthy();
  });

  it("explains when there's nothing saved and no network", async () => {
    mockLoad.mockResolvedValue(null);
    await renderScreen();
    expect(
      await screen.findByText(/Couldn't load the emergency card, and there's no copy on this phone yet/),
    ).toBeTruthy();
  });

  it("opens an emergency quote request for the home", async () => {
    await renderScreen();
    await fireEvent.press(await screen.findByLabelText("Get emergency help"));
    expect(navigation.navigate).toHaveBeenCalledWith("QuoteRequest", {
      propertyId: "p1",
      propertyAddress: "40 Lake Dr, Orlando, FL",
      urgency: "emergency",
    });
  });

  it("shows storm steps and official sources in a hurricane state", async () => {
    await renderScreen("FL");
    expect(await screen.findByText("BEFORE A STORM")).toBeTruthy();
    expect(screen.getByText("AFTER A STORM")).toBeTruthy();
    expect(screen.getByText(/Follow local emergency officials/)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("National Hurricane Center (forecasts and watches)"));
    expect(Linking.openURL).toHaveBeenCalledWith("https://www.nhc.noaa.gov/");
  });

  it("leaves the storm steps out elsewhere", async () => {
    await renderScreen("CO");
    await screen.findByText("Front yard, by the meter");
    expect(screen.queryByText("BEFORE A STORM")).toBeNull();
  });

  it("lists what's missing", async () => {
    mockLoad.mockResolvedValue({
      card: buildEmergencyCard({ guide: null, policy: null, photos: [] }),
      savedAt: 0,
      fromPhone: false,
    });
    await renderScreen();
    expect(await screen.findByText("NOT ON THIS CARD YET")).toBeTruthy();
    expect(screen.getByText(/Your insurance policy/)).toBeTruthy();
  });
});
