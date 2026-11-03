/**
 * PhotoUploadScreen (test-gap audit 2026-11-03, M1): camera-first pick,
 * permission fallbacks, validation, and upload success and failure.
 */

import React from "react";
import { Alert } from "react-native";
import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";

jest.mock("expo-image-picker", () => ({
  requestCameraPermissionsAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));
const mockUpload = jest.fn();
jest.mock("../../services/photoUploadService", () => ({
  ...jest.requireActual("../../services/photoUploadService"),
  uploadPhoto: (...a: unknown[]) => mockUpload(...a),
}));

import * as ImagePicker from "expo-image-picker";
import PhotoUploadScreen from "../../screens/PhotoUploadScreen";

const mockPicker = ImagePicker as unknown as Record<string, jest.Mock>;

const navigation = { goBack: jest.fn() };
const route = { params: { jobId: "j1", propertyId: "p1", jobServiceType: "HVAC" } };
const goodAsset = {
  uri: "file:///a.jpg",
  base64: "AAAA",
  mimeType: "image/jpeg",
  fileSize: 2048,
  width: 10,
  height: 10,
};

function renderScreen() {
  return render(<PhotoUploadScreen {...({ route, navigation } as any)} />);
}

let alertSpy: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  mockPicker.requestCameraPermissionsAsync.mockResolvedValue({ status: "granted" });
  mockPicker.requestMediaLibraryPermissionsAsync.mockResolvedValue({ status: "granted" });
  mockPicker.launchCameraAsync.mockResolvedValue({ canceled: false, assets: [goodAsset] });
});

it("opens the camera on mount and previews the photo with its size", async () => {
  await renderScreen();
  expect(await screen.findByText("ATTACH PHOTO")).toBeTruthy();
  expect(mockPicker.launchCameraAsync).toHaveBeenCalledWith(expect.objectContaining({ base64: true }));
  expect(screen.getByText(/HVAC JOB/)).toBeTruthy();
  expect(screen.getByText(/10 × 10.*2 KB/)).toBeTruthy();
});

it("goes back when the camera is cancelled", async () => {
  mockPicker.launchCameraAsync.mockResolvedValue({ canceled: true, assets: [] });
  await renderScreen();
  await waitFor(() => expect(navigation.goBack).toHaveBeenCalled());
});

it("offers the library when camera access is denied", async () => {
  mockPicker.requestCameraPermissionsAsync.mockResolvedValue({ status: "denied" });
  mockPicker.launchImageLibraryAsync.mockResolvedValue({ canceled: false, assets: [goodAsset] });
  await renderScreen();
  await waitFor(() =>
    expect(alertSpy).toHaveBeenCalledWith("Camera access required", expect.any(String), expect.any(Array)),
  );
  const buttons = alertSpy.mock.calls[0][2];
  buttons.find((b: any) => b.text === "Use Library Instead").onPress();
  expect(await screen.findByText("ATTACH PHOTO")).toBeTruthy();
  expect(mockPicker.launchCameraAsync).not.toHaveBeenCalled();
});

it("shows a validation error with retry and library options for a non-JPEG/PNG file", async () => {
  mockPicker.launchCameraAsync.mockResolvedValue({
    canceled: false,
    assets: [{ ...goodAsset, mimeType: "image/heic" }],
  });
  await renderScreen();
  expect(await screen.findByText("Only JPEG or PNG images are supported.")).toBeTruthy();
  mockPicker.requestMediaLibraryPermissionsAsync.mockResolvedValue({ status: "denied" });
  await fireEvent.press(screen.getByText("CHOOSE FROM LIBRARY"));
  await waitFor(() => expect(alertSpy).toHaveBeenCalledWith("Permission required", expect.any(String)));
});

it("uploads on confirm, then goes back after OK", async () => {
  mockUpload.mockResolvedValue(undefined);
  await renderScreen();
  await fireEvent.press(await screen.findByText("ATTACH PHOTO"));
  await waitFor(() => expect(mockUpload).toHaveBeenCalledWith("j1", "p1", expect.objectContaining({ base64: "AAAA" })));
  await waitFor(() => expect(alertSpy).toHaveBeenCalledWith("Photo uploaded", expect.any(String), expect.any(Array)));
  alertSpy.mock.calls.at(-1)[2][0].onPress();
  expect(navigation.goBack).toHaveBeenCalled();
});

it("shows the canister's reason when the upload fails, and stays on the preview", async () => {
  const { canisterError } = jest.requireActual("@homegentic/shared/canisterError");
  mockUpload.mockRejectedValue(canisterError({ InvalidInput: "This job already has 5 photos on the Free plan." }));
  await renderScreen();
  await fireEvent.press(await screen.findByText("ATTACH PHOTO"));
  await waitFor(() =>
    expect(alertSpy).toHaveBeenCalledWith("Upload failed", "This job already has 5 photos on the Free plan."),
  );
  expect(screen.getByText("ATTACH PHOTO")).toBeTruthy();
  expect(navigation.goBack).not.toHaveBeenCalled();
});
