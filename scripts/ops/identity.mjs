// Loads the controller identity the GitHub workflows hold (MAINNET_IDENTITY_PEM
// or DFX_IDENTITY_PEM). dfx and icp-cli write either an Ed25519 PKCS#8 key or
// a secp256k1 "EC PRIVATE KEY"; both are accepted.
import { createPrivateKey } from "node:crypto";
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity";
import { Secp256k1KeyIdentity } from "@icp-sdk/core/identity/secp256k1";

export function identityFromPem(pem) {
  if (!pem || !pem.includes("PRIVATE KEY")) throw new Error("identity PEM is empty or not a private key");
  if (pem.includes("BEGIN EC PRIVATE KEY")) return Secp256k1KeyIdentity.fromPem(pem);
  const key = createPrivateKey({ key: pem, format: "pem" });
  const jwk = key.export({ format: "jwk" });
  if (jwk.crv === "Ed25519" && jwk.d)
    return Ed25519KeyIdentity.fromSecretKey(new Uint8Array(Buffer.from(jwk.d, "base64url")));
  if (jwk.crv === "secp256k1")
    return Secp256k1KeyIdentity.fromPem(key.export({ format: "pem", type: "sec1" }).toString());
  throw new Error(`unsupported identity key (curve ${jwk.crv ?? "unknown"})`);
}
