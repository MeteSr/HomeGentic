/**
 * /mobile-auth (Internet Identity sign-in for the mobile app) and
 * /gift/redeem, which had no unit coverage (test-gap audit 2026-11-03, M3).
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MemoryRouter } from "react-router-dom";

const m = vi.hoisted(() => ({
  parse: vi.fn(),
  redirect: vi.fn(),
  openChannel: vi.fn(),
  requestDelegation: vi.fn(),
  closeChannel: vi.fn(),
  signerOpts: [] as unknown[],
  redeemGift: vi.fn(),
  login: vi.fn(),
  devLogin: vi.fn(),
  auth: { isAuthenticated: false },
  setReturnPath: vi.fn(),
}));

vi.mock("@/services/mobileAuth", () => ({ parseMobileAuthRequest: m.parse, mobileRedirectUrl: m.redirect }));
vi.mock("@/services/actor", () => ({ II_URL: "https://id.ai", iiDerivationOrigin: () => "https://app.example" }));
vi.mock("@icp-sdk/signer", () => ({
  Signer: class {
    constructor(opts: unknown) {
      m.signerOpts.push(opts);
    }
    openChannel = m.openChannel;
    requestDelegation = m.requestDelegation;
    closeChannel = m.closeChannel;
  },
}));
vi.mock("@icp-sdk/signer/web", () => ({
  PostMessageTransport: class {
    constructor(public opts: unknown) {}
  },
}));
vi.mock("@icp-sdk/core/identity", () => ({ Ed25519PublicKey: { fromDer: (der: unknown) => ({ der }) } }));
vi.mock("@/components/PageHead", () => ({ PageHead: () => null }));
vi.mock("@/services/payment", () => ({ paymentService: { redeemGift: m.redeemGift } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ login: m.login, devLogin: m.devLogin }) }));
vi.mock("@/store/authStore", () => ({ useAuthStore: () => m.auth }));
vi.mock("@/utils/returnPath", () => ({ setReturnPath: m.setReturnPath }));

import { canisterError } from "@/services/candid";
import MobileAuthPage from "@/pages/MobileAuthPage";
import RedeemGiftPage from "@/pages/RedeemGiftPage";

const realLocation = window.location;
let assigned: string[] = [];
beforeEach(() => {
  vi.clearAllMocks();
  m.signerOpts.length = 0;
  m.closeChannel.mockResolvedValue(undefined);
  m.auth.isAuthenticated = false;
  assigned = [];
  Object.defineProperty(window, "location", {
    configurable: true,
    value: {
      ...realLocation,
      search: "?pubkey=ab&maxTimeToLive=1",
      pathname: "/gift/redeem",
      set href(v: string) {
        assigned.push(v);
      },
    },
  });
});
afterEach(() => {
  Object.defineProperty(window, "location", { configurable: true, value: realLocation });
});

describe("MobileAuthPage", () => {
  const REQUEST = { publicKeyDer: new Uint8Array([1, 2]), maxTimeToLive: 3_600_000_000_000n };

  it("says the link doesn't work when the app's request is missing or bad", () => {
    m.parse.mockReturnValue(null);
    render(<MobileAuthPage />);
    expect(screen.getByRole("heading", { name: "This link doesn't work" })).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("asks II for a delegation to the app's key and sends it back to the app", async () => {
    m.parse.mockReturnValue(REQUEST);
    m.requestDelegation.mockResolvedValue({ chain: true });
    m.redirect.mockReturnValue("homegentic://auth?delegation=x");
    render(<MobileAuthPage />);
    fireEvent.click(screen.getByRole("button", { name: "Continue with Internet Identity" }));

    expect(await screen.findByRole("heading", { name: "You're signed in" })).toBeInTheDocument();
    expect(m.signerOpts[0]).toMatchObject({ derivationOrigin: "https://app.example" });
    expect(m.requestDelegation).toHaveBeenCalledWith({
      publicKey: { der: REQUEST.publicKeyDer },
      maxTimeToLive: REQUEST.maxTimeToLive,
    });
    expect(m.redirect).toHaveBeenCalledWith({ chain: true });
    expect(assigned).toEqual(["homegentic://auth?delegation=x"]);
    expect(screen.getByRole("link", { name: "Open HomeGentic" })).toHaveAttribute(
      "href",
      "homegentic://auth?delegation=x",
    );
    expect(m.closeChannel).toHaveBeenCalled();
  });

  it("shows a retry message when II doesn't finish, and closes the channel", async () => {
    m.parse.mockReturnValue(REQUEST);
    m.openChannel.mockRejectedValue(new Error("window closed"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<MobileAuthPage />);
    fireEvent.click(screen.getByRole("button", { name: "Continue with Internet Identity" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Sign-in didn't finish");
    expect(screen.getByRole("button", { name: "Continue with Internet Identity" })).toBeEnabled();
    expect(m.closeChannel).toHaveBeenCalled();
    expect(assigned).toEqual([]);
  });
});

describe("RedeemGiftPage", () => {
  const renderGift = (query = "?token=cs_test_1") =>
    render(
      <MemoryRouter initialEntries={[`/gift/redeem${query}`]}>
        <RedeemGiftPage />
      </MemoryRouter>,
    );

  it("explains a link with no gift code", () => {
    renderGift("");
    expect(screen.getByRole("heading", { name: "Gift link incomplete" })).toBeInTheDocument();
  });

  it("a signed-out visitor signs in first and comes back to this page", () => {
    renderGift();
    fireEvent.click(screen.getByRole("button", { name: "Sign in to redeem" }));
    expect(m.setReturnPath).toHaveBeenCalled();
    expect(m.login.mock.calls.length + m.devLogin.mock.calls.length).toBe(1);
  });

  it("redeems for a signed-in user and says nothing renews", async () => {
    m.auth.isAuthenticated = true;
    m.redeemGift.mockResolvedValue(undefined);
    renderGift();
    fireEvent.click(screen.getByRole("button", { name: "Redeem gift" }));
    expect(await screen.findByRole("heading", { name: "Your gift is active" })).toBeInTheDocument();
    expect(m.redeemGift).toHaveBeenCalledWith("cs_test_1");
    expect(screen.getByText(/nothing renews and you won't be charged/)).toBeInTheDocument();
  });

  it.each([
    [canisterError({ NotFound: null }), /couldn't find this gift/],
    [new Error("Gift already redeemed"), /already been redeemed/],
    [new Error("boom"), /couldn't be redeemed/],
  ])("explains a failed redeem (%s)", async (err, text) => {
    m.auth.isAuthenticated = true;
    m.redeemGift.mockRejectedValue(err);
    renderGift();
    fireEvent.click(screen.getByRole("button", { name: "Redeem gift" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(text));
    expect(screen.getByRole("button", { name: "Redeem gift" })).toBeEnabled();
  });
});
