/**
 * Signing out (or the session running out) clears the saved sign-in and
 * every emergency card kept on the phone (#715), so the next person to use
 * the phone doesn't see the last person's shutoffs and contacts.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

const mockDelete = jest.fn(async (_key: string) => {});
jest.mock("expo-secure-store", () => ({
  deleteItemAsync: (key: string) => mockDelete(key),
  setItemAsync: jest.fn(),
  getItemAsync: jest.fn(),
}));

import { clearAuth } from "../../auth/authStorage";

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
});

describe("clearAuth", () => {
  it("removes the stored sign-in", async () => {
    await clearAuth();
    expect(mockDelete.mock.calls.map((c) => c[0])).toEqual(["hf_delegation_chain", "hf_user_pubkey", "hf_session_key"]);
  });

  it("removes saved emergency cards", async () => {
    await AsyncStorage.setItem("homegentic_emergency_card_alice_p1", "{}");
    await clearAuth();
    expect(await AsyncStorage.getItem("homegentic_emergency_card_alice_p1")).toBeNull();
  });

  it("still signs out when the cards can't be cleared", async () => {
    (AsyncStorage.getAllKeys as jest.Mock).mockRejectedValueOnce(new Error("storage"));
    await expect(clearAuth()).resolves.toBeUndefined();
    expect(mockDelete).toHaveBeenCalledTimes(3);
  });
});
