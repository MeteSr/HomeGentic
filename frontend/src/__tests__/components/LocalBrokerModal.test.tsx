/**
 * LocalBrokerModal — real logic worth locking down:
 *   - isLocalBrokerArea matches against the Daytona-area city set
 *     (trimmed), case-sensitively
 *   - isLocalBrokerDismissed reads the localStorage dismiss flag and
 *     never throws when storage is unavailable
 *   - the contact form requires a name and email before submitting
 *   - a successful submit sends the consultation email, sets the
 *     dismiss flag, and shows the "Request sent!" confirmation
 *   - a failed submit shows a toast and stays on the form
 *   - dismissing (via X or "No thanks") sets the flag and calls onClose
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import LocalBrokerModal, { isLocalBrokerArea, isLocalBrokerDismissed } from "@/components/LocalBrokerModal";

const { mockSendEmail } = vi.hoisted(() => ({ mockSendEmail: vi.fn() }));
vi.mock("@/services/aiProxy", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/aiProxy")>();
  return { ...actual, aiProxyService: { sendEmail: mockSendEmail } };
});

const { mockToastError } = vi.hoisted(() => ({ mockToastError: vi.fn() }));
vi.mock("react-hot-toast", () => ({ default: { error: mockToastError } }));

function renderModal(props: Partial<React.ComponentProps<typeof LocalBrokerModal>> = {}) {
  const onClose = vi.fn();
  const utils = render(<LocalBrokerModal propertyAddress="123 Main St, Daytona Beach" onClose={onClose} {...props} />);
  const nameInput = utils.container.querySelector('input:not([type])')!;
  const emailInput = utils.container.querySelector('input[type="email"]')!;
  return { ...utils, onClose, nameInput, emailInput };
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe("isLocalBrokerArea", () => {
  it("matches a city in the Daytona-area set, trimmed", () => {
    expect(isLocalBrokerArea(["  Daytona Beach  "])).toBe(true);
    expect(isLocalBrokerArea(["Ormond Beach"])).toBe(true);
  });

  it("returns false when no city matches", () => {
    expect(isLocalBrokerArea(["Austin", "Miami"])).toBe(false);
    expect(isLocalBrokerArea([])).toBe(false);
  });
});

describe("isLocalBrokerDismissed", () => {
  it("reflects the localStorage dismiss flag", () => {
    expect(isLocalBrokerDismissed()).toBe(false);
    localStorage.setItem("hg_local_broker_dismissed", "1");
    expect(isLocalBrokerDismissed()).toBe(true);
  });
});

describe("LocalBrokerModal — validation", () => {
  it("requires a name and email before submitting", () => {
    const { container } = renderModal();
    // native `required` attrs block a real click; submit the form directly
    // to reach the component's own guard clause.
    fireEvent.submit(container.querySelector("form")!);
    expect(mockToastError).toHaveBeenCalledWith("Name and email are required");
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});

describe("LocalBrokerModal — submission", () => {
  it("sends the consultation email, sets the dismiss flag, and shows confirmation", async () => {
    mockSendEmail.mockResolvedValue(undefined);
    const { nameInput, emailInput } = renderModal();

    fireEvent.change(nameInput, { target: { value: "Jamie Rivera" } });
    fireEvent.change(emailInput, { target: { value: "jamie@example.com" } });
    fireEvent.click(screen.getByText("Yes, contact me"));

    await waitFor(() => expect(screen.getByText("Request sent!")).toBeInTheDocument());
    expect(mockSendEmail).toHaveBeenCalledWith(
      "",
      "HomeGentic: Local Broker Consultation Request",
      expect.stringContaining("Jamie Rivera"),
    );
    expect(localStorage.getItem("hg_local_broker_dismissed")).toBe("1");
  });

  it("shows an error toast and stays on the form when sending fails", async () => {
    mockSendEmail.mockRejectedValue(new Error("network down"));
    const { nameInput, emailInput } = renderModal();

    fireEvent.change(nameInput, { target: { value: "Jamie Rivera" } });
    fireEvent.change(emailInput, { target: { value: "jamie@example.com" } });
    fireEvent.click(screen.getByText("Yes, contact me"));

    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith("Could not send request. Please try again."));
    expect(screen.queryByText("Request sent!")).not.toBeInTheDocument();
    expect(localStorage.getItem("hg_local_broker_dismissed")).toBeNull();
  });
});

describe("LocalBrokerModal — dismissal", () => {
  it("sets the dismiss flag and closes via No thanks", () => {
    const { onClose } = renderModal();
    fireEvent.click(screen.getByText("No thanks"));
    expect(localStorage.getItem("hg_local_broker_dismissed")).toBe("1");
    expect(onClose).toHaveBeenCalled();
  });

  it("sets the dismiss flag and closes via the X button", () => {
    const { onClose, container } = renderModal();
    fireEvent.click(container.querySelector("button")!);
    expect(localStorage.getItem("hg_local_broker_dismissed")).toBe("1");
    expect(onClose).toHaveBeenCalled();
  });
});
