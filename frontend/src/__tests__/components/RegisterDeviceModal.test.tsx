/**
 * RegisterDeviceModal — real logic worth locking down:
 *   - Tier A (most sources): plain device-ID field with optional
 *     format/instructions help toggle
 *   - Tier B (Ecobee, Honeywell, LG, GE): OAuth connect → device list →
 *     pick populates name/id, and Register stays disabled until a
 *     device is picked
 *   - Tier C (Enphase, Tesla): device ID is built as "lanIp:serial",
 *     and Register stays disabled until both are filled
 *   - validation: name+id required; propertyId required; registerDevice
 *     errors surface as a toast without closing the modal
 *   - backdrop click closes only when the backdrop itself is clicked
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { RegisterDeviceModal } from "@/components/RegisterDeviceModal";
import type { SensorDevice } from "@/services/sensor";

const { mockRegisterDevice } = vi.hoisted(() => ({ mockRegisterDevice: vi.fn() }));
vi.mock("@/services/sensor", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/sensor")>();
  return { ...actual, sensorService: { registerDevice: mockRegisterDevice } };
});

const { mockOAuth } = vi.hoisted(() => ({
  mockOAuth: {
    start: vi.fn(),
    devices: [] as any[],
    loading: false,
    error: null as string | null,
    reset: vi.fn(),
  },
}));
vi.mock("@/hooks/useOAuthDevicePicker", () => ({ useOAuthDevicePicker: () => mockOAuth }));

const { mockToastError, mockToastSuccess } = vi.hoisted(() => ({
  mockToastError: vi.fn(),
  mockToastSuccess: vi.fn(),
}));
vi.mock("react-hot-toast", () => ({ default: { error: mockToastError, success: mockToastSuccess } }));

function makeDevice(overrides: Partial<SensorDevice> = {}): SensorDevice {
  return {
    id: "dev-1", propertyId: "prop-1", homeowner: "p", externalDeviceId: "ext-1",
    source: "Nest" as any, name: "Thermostat", registeredAt: Date.now(), isActive: true,
    ...overrides,
  };
}

function renderModal(props: Partial<React.ComponentProps<typeof RegisterDeviceModal>> = {}) {
  const onClose = vi.fn();
  const onSuccess = vi.fn();
  const utils = render(
    <RegisterDeviceModal isOpen onClose={onClose} onSuccess={onSuccess} propertyId="prop-1" {...props} />
  );
  return { ...utils, onClose, onSuccess };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockOAuth.devices = [];
  mockOAuth.loading = false;
  mockOAuth.error = null;
});

describe("RegisterDeviceModal — visibility", () => {
  it("renders nothing when isOpen is false", () => {
    const { container } = render(
      <RegisterDeviceModal isOpen={false} onClose={vi.fn()} onSuccess={vi.fn()} propertyId="prop-1" />
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("RegisterDeviceModal — Tier A (default source)", () => {
  it("requires both name and device ID", async () => {
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Register Device" }));

    expect(mockToastError).toHaveBeenCalledWith("Device name and ID are required");
    expect(mockRegisterDevice).not.toHaveBeenCalled();
  });

  it("toggles the 'where do I find this?' help text", () => {
    renderModal(); // default source is Nest, which has help text
    expect(screen.queryByText(/Find your device ID in the Google Home app/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Where do I find this?"));
    expect(screen.getByText(/Find your device ID in the Google Home app/)).toBeInTheDocument();

    fireEvent.click(screen.getByText("Where do I find this?"));
    expect(screen.queryByText(/Find your device ID in the Google Home app/)).not.toBeInTheDocument();
  });

  it("registers the device with the plain entered ID and succeeds", async () => {
    mockRegisterDevice.mockResolvedValue(makeDevice());
    const { onSuccess, onClose } = renderModal();

    fireEvent.change(screen.getByLabelText("Device Name"), { target: { value: "Living Room Thermostat" } });
    fireEvent.change(screen.getByLabelText("Device / Site ID"), { target: { value: "projects/x/devices/y" } });
    fireEvent.click(screen.getByRole("button", { name: "Register Device" }));

    await waitFor(() => expect(mockRegisterDevice).toHaveBeenCalledWith(
      "prop-1", "projects/x/devices/y", "Nest", "Living Room Thermostat"
    ));
    expect(mockToastSuccess).toHaveBeenCalledWith("Device registered");
    expect(onSuccess).toHaveBeenCalledWith(expect.objectContaining({ id: "dev-1" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("shows an error toast and keeps the modal open when registration fails", async () => {
    mockRegisterDevice.mockRejectedValue(new Error("Device already registered"));
    const { onClose } = renderModal();

    fireEvent.change(screen.getByLabelText("Device Name"), { target: { value: "Thermostat" } });
    fireEvent.change(screen.getByLabelText("Device / Site ID"), { target: { value: "abc" } });
    fireEvent.click(screen.getByRole("button", { name: "Register Device" }));

    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith("Device already registered"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("requires a property to be selected", async () => {
    renderModal({ propertyId: "" });
    fireEvent.change(screen.getByLabelText("Device Name"), { target: { value: "Thermostat" } });
    fireEvent.change(screen.getByLabelText("Device / Site ID"), { target: { value: "abc" } });

    fireEvent.click(screen.getByRole("button", { name: "Register Device" }));

    expect(mockToastError).toHaveBeenCalledWith("No property selected");
  });
});

describe("RegisterDeviceModal — Tier B (OAuth sources)", () => {
  it("keeps Register disabled until a device is picked from the OAuth list", async () => {
    renderModal();
    fireEvent.change(screen.getByLabelText("Device Type"), { target: { value: "Ecobee" } });

    expect(screen.getByRole("button", { name: "Register Device" })).toBeDisabled();

    fireEvent.click(screen.getByText("Connect Ecobee Account"));
    expect(mockOAuth.start).toHaveBeenCalledWith("ecobee");
  });

  it("populates name/id when a device is picked from the OAuth list", () => {
    mockOAuth.devices = [{ id: "ecobee-1", name: "Ecobee Downstairs", type: "thermostat" }];
    renderModal();
    fireEvent.change(screen.getByLabelText("Device Type"), { target: { value: "Ecobee" } });

    fireEvent.click(screen.getByText("Ecobee Downstairs"));

    expect(screen.getByDisplayValue("Ecobee Downstairs")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Register Device" })).not.toBeDisabled();
  });

  it("clears the picked device when 'Choose a different device' is clicked", () => {
    mockOAuth.devices = [{ id: "ecobee-1", name: "Ecobee Downstairs", type: "thermostat" }];
    renderModal();
    fireEvent.change(screen.getByLabelText("Device Type"), { target: { value: "Ecobee" } });
    fireEvent.click(screen.getByText("Ecobee Downstairs"));
    expect(screen.getByText("Selected")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Choose a different device"));

    expect(mockOAuth.reset).toHaveBeenCalled();
    expect(screen.queryByText("Selected")).not.toBeInTheDocument();
  });
});

describe("RegisterDeviceModal — Tier C (LAN sources)", () => {
  it("keeps Register disabled until both the LAN IP and serial are filled", () => {
    renderModal();
    fireEvent.change(screen.getByLabelText("Device Type"), { target: { value: "TeslaPowerwall" } });
    expect(screen.getByRole("button", { name: "Register Device" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Local IP Address"), { target: { value: "192.168.1.42" } });
    expect(screen.getByRole("button", { name: "Register Device" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Serial Number"), { target: { value: "1232100-00-J" } });
    expect(screen.getByRole("button", { name: "Register Device" })).not.toBeDisabled();
  });

  it("builds the device ID as 'lanIp:serial' on submit", async () => {
    mockRegisterDevice.mockResolvedValue(makeDevice());
    renderModal();
    fireEvent.change(screen.getByLabelText("Device Type"), { target: { value: "TeslaPowerwall" } });
    fireEvent.change(screen.getByLabelText("Device Name"), { target: { value: "Powerwall" } });
    fireEvent.change(screen.getByLabelText("Local IP Address"), { target: { value: "192.168.1.42" } });
    fireEvent.change(screen.getByLabelText("Serial Number"), { target: { value: "1232100-00-J" } });

    fireEvent.click(screen.getByRole("button", { name: "Register Device" }));

    await waitFor(() => expect(mockRegisterDevice).toHaveBeenCalledWith(
      "prop-1", "192.168.1.42:1232100-00-J", "TeslaPowerwall", "Powerwall"
    ));
  });
});

describe("RegisterDeviceModal — dismissal", () => {
  it("closes when Cancel is clicked", () => {
    const { onClose } = renderModal();
    fireEvent.click(screen.getByText("Cancel"));
    expect(onClose).toHaveBeenCalled();
  });

  it("closes on backdrop click but not when clicking the dialog itself", () => {
    const { onClose } = renderModal();
    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("dialog").parentElement!);
    expect(onClose).toHaveBeenCalled();
  });
});
