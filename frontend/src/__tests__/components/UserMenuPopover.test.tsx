/**
 * UserMenuPopover — real logic worth locking down:
 *   - every menu item closes the popover before performing its action
 *   - Settings/Billing/Invite navigate to the right routes
 *   - Attach receipt clicks the shared voice-agent file input
 *   - Upgrade plan calls onUpgrade; Sign out calls the auth logout
 *   - the backdrop click closes the popover
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { UserMenuPopover } from "@/components/UserMenuPopover";
import { voiceAgentFileInputRef } from "@/components/VoiceAgent";

const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }));
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

const { mockLogout } = vi.hoisted(() => ({ mockLogout: vi.fn() }));
vi.mock("@/contexts/AuthContext", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/contexts/AuthContext")>();
  return { ...actual, useAuth: () => ({ logout: mockLogout }) };
});

function renderPopover(props: Partial<React.ComponentProps<typeof UserMenuPopover>> = {}) {
  const onClose = vi.fn();
  const onUpgrade = vi.fn();
  const utils = render(<UserMenuPopover displayName="Jamie Rivera" onClose={onClose} onUpgrade={onUpgrade} {...props} />);
  return { ...utils, onClose, onUpgrade };
}

beforeEach(() => {
  vi.clearAllMocks();
  voiceAgentFileInputRef.current = null;
});

describe("UserMenuPopover — header", () => {
  it("shows the display name", () => {
    renderPopover();
    expect(screen.getByText("Jamie Rivera")).toBeInTheDocument();
  });
});

describe("UserMenuPopover — navigation items", () => {
  it("closes and navigates to /settings", () => {
    const { onClose } = renderPopover();
    fireEvent.click(screen.getByText("Settings"));
    expect(onClose).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith("/settings");
  });

  it("closes and navigates to /settings?tab=subscription", () => {
    const { onClose } = renderPopover();
    fireEvent.click(screen.getByText("Billing & Plan"));
    expect(onClose).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith("/settings?tab=subscription");
  });

  it("closes and navigates to /refer", () => {
    const { onClose } = renderPopover();
    fireEvent.click(screen.getByText("Invite a neighbor"));
    expect(onClose).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith("/refer");
  });
});

describe("UserMenuPopover — attach receipt", () => {
  it("closes and clicks the shared voice-agent file input", () => {
    const mockClick = vi.fn();
    voiceAgentFileInputRef.current = { click: mockClick } as unknown as HTMLInputElement;
    const { onClose } = renderPopover();

    fireEvent.click(screen.getByText("Attach receipt or photo"));

    expect(onClose).toHaveBeenCalled();
    expect(mockClick).toHaveBeenCalled();
  });

  it("does not throw when the file input ref is not yet attached", () => {
    voiceAgentFileInputRef.current = null;
    renderPopover();
    expect(() => fireEvent.click(screen.getByText("Attach receipt or photo"))).not.toThrow();
  });
});

describe("UserMenuPopover — upgrade / sign out", () => {
  it("closes and calls onUpgrade", () => {
    const { onClose, onUpgrade } = renderPopover();
    fireEvent.click(screen.getByText("Upgrade plan"));
    expect(onClose).toHaveBeenCalled();
    expect(onUpgrade).toHaveBeenCalled();
  });

  it("closes and calls logout", () => {
    const { onClose } = renderPopover();
    fireEvent.click(screen.getByText("Sign out"));
    expect(onClose).toHaveBeenCalled();
    expect(mockLogout).toHaveBeenCalled();
  });
});

describe("UserMenuPopover — backdrop", () => {
  it("closes on backdrop click", () => {
    const { onClose, container } = renderPopover();
    fireEvent.click(container.firstChild as Element);
    expect(onClose).toHaveBeenCalled();
  });
});
