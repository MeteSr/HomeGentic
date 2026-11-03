/**
 * useNotifications (test-gap audit 2026-11-03, M1): push permission is asked
 * only once signed in, the native device token is registered with a session
 * token (never a self-asserted principal), and sign-out unregisters it.
 */

import React from "react";
import { render, act } from "@testing-library/react-native";

jest.mock("expo-notifications", () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getDevicePushTokenAsync: jest.fn(),
}));
const mockRegister = jest.fn();
const mockUnregister = jest.fn();
jest.mock("../../services/notificationService", () => ({
  ...jest.requireActual("../../services/notificationService"),
  registerPushToken: (...a: unknown[]) => mockRegister(...a),
  unregisterPushToken: (...a: unknown[]) => mockUnregister(...a),
}));
const mockIssue = jest.fn();
jest.mock("../../services/authService", () => ({ issueAgentSession: (...a: unknown[]) => mockIssue(...a) }));
let mockAuth: any = { status: "idle" };
jest.mock("../../auth/AuthContext", () => ({ useAuthContext: () => ({ authState: mockAuth }) }));

import * as Notifications from "expo-notifications";
import { useNotifications } from "../../hooks/useNotifications";

const N = Notifications as unknown as Record<string, jest.Mock>;
const agent = { id: "agent" };
const signedIn = (principal = "p-1") => ({ status: "authenticated", principal, agent });

function Probe() {
  useNotifications();
  return null;
}
const flush = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });

beforeEach(() => {
  jest.clearAllMocks();
  N.getPermissionsAsync.mockResolvedValue({ status: "granted" });
  N.requestPermissionsAsync.mockResolvedValue({ status: "granted" });
  N.getDevicePushTokenAsync.mockResolvedValue({ data: "device-tok" });
  mockIssue.mockResolvedValue({ token: "sess-tok", expiresAtMs: 1 });
  mockRegister.mockResolvedValue(true);
  mockUnregister.mockResolvedValue(undefined);
});

it("asks nothing before sign-in", async () => {
  mockAuth = { status: "idle" };
  await render(<Probe />);
  await flush();
  expect(N.getPermissionsAsync).not.toHaveBeenCalled();
  expect(mockRegister).not.toHaveBeenCalled();
});

it("registers the native device token with the session token once signed in", async () => {
  mockAuth = signedIn();
  await render(<Probe />);
  await flush();
  expect(mockIssue).toHaveBeenCalledWith(agent);
  expect(mockRegister).toHaveBeenCalledWith(expect.objectContaining({ token: "device-tok" }), "sess-tok");
});

it("requests permission when not yet granted, and stops if the user declines", async () => {
  mockAuth = signedIn();
  N.getPermissionsAsync.mockResolvedValue({ status: "undetermined" });
  N.requestPermissionsAsync.mockResolvedValue({ status: "denied" });
  await render(<Probe />);
  await flush();
  expect(N.requestPermissionsAsync).toHaveBeenCalled();
  expect(N.getDevicePushTokenAsync).not.toHaveBeenCalled();
  expect(mockRegister).not.toHaveBeenCalled();
});

it("still registers (with no session) when the session token can't be issued", async () => {
  mockAuth = signedIn();
  mockIssue.mockRejectedValue(new Error("auth down"));
  await render(<Probe />);
  await flush();
  expect(mockRegister).toHaveBeenCalledWith(expect.anything(), null);
});

it("unregisters the token on sign-out", async () => {
  mockAuth = signedIn();
  const view = await render(<Probe />);
  await flush();
  mockAuth = { status: "idle" };
  await view.rerender(<Probe />);
  await flush();
  expect(mockUnregister).toHaveBeenCalledWith("device-tok", "sess-tok");
});

it("re-registers for a different account", async () => {
  mockAuth = signedIn("p-1");
  const view = await render(<Probe />);
  await flush();
  mockAuth = signedIn("p-2");
  await view.rerender(<Probe />);
  await flush();
  expect(mockUnregister).toHaveBeenCalledTimes(1);
  expect(mockRegister).toHaveBeenCalledTimes(2);
});
