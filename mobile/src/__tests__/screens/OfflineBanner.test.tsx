/**
 * TDD — OfflineBanner component
 */

import React from "react";
import { render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import OfflineBanner from "../../screens/OfflineBanner";

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };
const inSafeArea = (ui: React.ReactElement) => <SafeAreaProvider initialMetrics={metrics}>{ui}</SafeAreaProvider>;

describe("OfflineBanner", () => {
  it("is visible when offline=true", () => {
    render(inSafeArea(<OfflineBanner offline={true} />));
    expect(screen.getByText(/offline/i)).toBeTruthy();
  });

  it("only promises to hold jobs, the one write the app queues", () => {
    render(inSafeArea(<OfflineBanner offline={true} />));
    expect(screen.getByText(/jobs you log are saved on this phone/i)).toBeTruthy();
  });

  it("renders nothing when offline=false", () => {
    render(inSafeArea(<OfflineBanner offline={false} />));
    expect(screen.queryByText(/offline/i)).toBeNull();
  });
});
