import * as SecureStore from "expo-secure-store";

const DELEGATION_KEY = "hf_delegation_chain";
const PUBKEY_KEY     = "hf_user_pubkey";
// The Ed25519 session key the delegation chain targets. Without it a
// restored chain cannot sign anything, so it is persisted next to the chain
// (SecureStore = Keychain / Android Keystore-backed storage).
const SESSION_KEY    = "hf_session_key";

export interface StoredAuth {
  delegationChainJSON: string;
  userPublicKey: string;
  /** Ed25519KeyIdentity.toJSON() of the session key, serialised as a string */
  sessionKeyJSON: string;
}

export async function saveAuth(auth: StoredAuth): Promise<void> {
  await SecureStore.setItemAsync(DELEGATION_KEY, auth.delegationChainJSON);
  await SecureStore.setItemAsync(PUBKEY_KEY, auth.userPublicKey);
  await SecureStore.setItemAsync(SESSION_KEY, auth.sessionKeyJSON);
}

export async function loadAuth(): Promise<StoredAuth | null> {
  const delegationChainJSON = await SecureStore.getItemAsync(DELEGATION_KEY);
  const userPublicKey        = await SecureStore.getItemAsync(PUBKEY_KEY);
  const sessionKeyJSON       = await SecureStore.getItemAsync(SESSION_KEY);
  if (!delegationChainJSON || !userPublicKey || !sessionKeyJSON) return null;
  return { delegationChainJSON, userPublicKey, sessionKeyJSON };
}

export async function clearAuth(): Promise<void> {
  await SecureStore.deleteItemAsync(DELEGATION_KEY);
  await SecureStore.deleteItemAsync(PUBKEY_KEY);
  await SecureStore.deleteItemAsync(SESSION_KEY);
}
