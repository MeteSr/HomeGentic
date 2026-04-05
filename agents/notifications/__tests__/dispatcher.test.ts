/**
 * @jest-environment node
 */
// 15.3.4 — dispatcher: fan-out + stale token eviction
import { registerToken, removeToken, getTokensForPrincipal } from "../store";

// Mock transport modules before importing dispatcher
jest.mock("../apns", () => ({ sendApns: jest.fn() }));
jest.mock("../fcm",  () => ({ sendFcm:  jest.fn() }));

import { dispatchToUser } from "../dispatcher";
import { sendApns } from "../apns";
import { sendFcm  } from "../fcm";

const mockSendApns = sendApns as jest.MockedFunction<typeof sendApns>;
const mockSendFcm  = sendFcm  as jest.MockedFunction<typeof sendFcm>;

const PRINCIPAL = "principal-abc";
const IOS_TOKEN = "ios-token-111";
const AND_TOKEN = "android-token-222";

const PAYLOAD = { title: "Test", body: "Hello", route: "jobs/42" };

beforeEach(() => {
  jest.clearAllMocks();
  // Clear registry between tests
  removeToken(IOS_TOKEN);
  removeToken(AND_TOKEN);
  removeToken("ios-token-333");
});

describe("dispatchToUser — delivery", () => {
  it("dispatches to an iOS device via sendApns", async () => {
    registerToken(PRINCIPAL, IOS_TOKEN, "ios");
    mockSendApns.mockResolvedValueOnce(undefined);

    await dispatchToUser(PRINCIPAL, PAYLOAD);

    expect(mockSendApns).toHaveBeenCalledTimes(1);
    expect(mockSendApns).toHaveBeenCalledWith(IOS_TOKEN, PAYLOAD);
    expect(mockSendFcm).not.toHaveBeenCalled();
  });

  it("dispatches to an Android device via sendFcm", async () => {
    registerToken(PRINCIPAL, AND_TOKEN, "android");
    mockSendFcm.mockResolvedValueOnce(undefined);

    await dispatchToUser(PRINCIPAL, PAYLOAD);

    expect(mockSendFcm).toHaveBeenCalledTimes(1);
    expect(mockSendFcm).toHaveBeenCalledWith(AND_TOKEN, PAYLOAD);
    expect(mockSendApns).not.toHaveBeenCalled();
  });

  it("fans out to multiple devices for the same principal", async () => {
    registerToken(PRINCIPAL, IOS_TOKEN, "ios");
    registerToken(PRINCIPAL, AND_TOKEN, "android");
    mockSendApns.mockResolvedValueOnce(undefined);
    mockSendFcm.mockResolvedValueOnce(undefined);

    await dispatchToUser(PRINCIPAL, PAYLOAD);

    expect(mockSendApns).toHaveBeenCalledTimes(1);
    expect(mockSendFcm).toHaveBeenCalledTimes(1);
  });

  it("is a no-op when principal has no registered tokens", async () => {
    await dispatchToUser("unknown-principal", PAYLOAD);

    expect(mockSendApns).not.toHaveBeenCalled();
    expect(mockSendFcm).not.toHaveBeenCalled();
  });
});

describe("dispatchToUser — stale token eviction", () => {
  it("evicts iOS token on APNs 410 error", async () => {
    registerToken(PRINCIPAL, IOS_TOKEN, "ios");
    mockSendApns.mockRejectedValueOnce(new Error("APNs 410: BadDeviceToken"));

    await dispatchToUser(PRINCIPAL, PAYLOAD);

    expect(getTokensForPrincipal(PRINCIPAL)).toHaveLength(0);
  });

  it("evicts iOS token on APNs BadDeviceToken error", async () => {
    registerToken(PRINCIPAL, IOS_TOKEN, "ios");
    mockSendApns.mockRejectedValueOnce(new Error("BadDeviceToken"));

    await dispatchToUser(PRINCIPAL, PAYLOAD);

    expect(getTokensForPrincipal(PRINCIPAL)).toHaveLength(0);
  });

  it("evicts Android token on FCM UNREGISTERED error", async () => {
    registerToken(PRINCIPAL, AND_TOKEN, "android");
    mockSendFcm.mockRejectedValueOnce(new Error("UNREGISTERED"));

    await dispatchToUser(PRINCIPAL, PAYLOAD);

    expect(getTokensForPrincipal(PRINCIPAL)).toHaveLength(0);
  });

  it("evicts Android token on FCM NotRegistered error", async () => {
    registerToken(PRINCIPAL, AND_TOKEN, "android");
    mockSendFcm.mockRejectedValueOnce(new Error("NotRegistered"));

    await dispatchToUser(PRINCIPAL, PAYLOAD);

    expect(getTokensForPrincipal(PRINCIPAL)).toHaveLength(0);
  });

  it("evicts only the stale token, leaving healthy sibling intact", async () => {
    registerToken(PRINCIPAL, IOS_TOKEN,     "ios");
    registerToken(PRINCIPAL, "ios-token-333", "ios");
    // First token stale, second succeeds
    mockSendApns
      .mockRejectedValueOnce(new Error("APNs 410: unregistered"))
      .mockResolvedValueOnce(undefined);

    await dispatchToUser(PRINCIPAL, PAYLOAD);

    const remaining = getTokensForPrincipal(PRINCIPAL);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].token).toBe("ios-token-333");
  });

  it("logs but does not throw on non-stale errors", async () => {
    registerToken(PRINCIPAL, IOS_TOKEN, "ios");
    mockSendApns.mockRejectedValueOnce(new Error("network timeout"));

    // Should not throw
    await expect(dispatchToUser(PRINCIPAL, PAYLOAD)).resolves.toBeUndefined();
    // Token should NOT be evicted for a network error
    expect(getTokensForPrincipal(PRINCIPAL)).toHaveLength(1);
  });
});
