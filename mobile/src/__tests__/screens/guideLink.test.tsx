/**
 * The day-1 setup tip ("Do you know where your water shutoff is?") opens
 * that home's emergency card when tapped on the phone.
 */
import React from "react";
import { render } from "@testing-library/react-native";

let mockLoaded = true;
const mockHome = { id: "P1", address: "12 Elm St, Raleigh, NC 27601", state: "NC" };
jest.mock("../../context/AppData", () => ({
  useAppData: () => ({ propertiesLoaded: mockLoaded, properties: [mockHome], contractor: false }),
}));

import { GuideLinkScreen } from "../../screens/LinkScreens";

const nav = () => ({ replace: jest.fn(), popTo: jest.fn() }) as any;
const route = (propertyId: string) => ({ key: "k", name: "GuideLink", params: { propertyId } }) as any;

jest.setTimeout(20_000);
beforeEach(() => {
  mockLoaded = true;
});

it("opens the home's emergency card", async () => {
  const navigation = nav();
  await render(<GuideLinkScreen navigation={navigation} route={route("P1")} />);
  expect(navigation.replace).toHaveBeenCalledWith("EmergencyCard", {
    propertyId: "P1",
    propertyAddress: "12 Elm St, Raleigh, NC 27601",
    state: "NC",
  });
});

it("goes to the Property tab for a home that isn't theirs any more", async () => {
  const navigation = nav();
  await render(<GuideLinkScreen navigation={navigation} route={route("GONE")} />);
  expect(navigation.popTo).toHaveBeenCalledWith("Tabs", { screen: "Property" });
});

it("waits for the homes to load", async () => {
  mockLoaded = false;
  const navigation = nav();
  await render(<GuideLinkScreen navigation={navigation} route={route("P1")} />);
  expect(navigation.replace).not.toHaveBeenCalled();
  expect(navigation.popTo).not.toHaveBeenCalled();
});
