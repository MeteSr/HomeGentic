/**
 * /mobile-auth — Internet Identity sign-in for the HomeGentic mobile app.
 * See services/mobileAuth.ts for how the delegation gets back to the app.
 */
import { useMemo, useState } from "react";
import { Ed25519PublicKey } from "@icp-sdk/core/identity";
import type { DerEncodedPublicKey } from "@icp-sdk/core/agent";
import { Signer } from "@icp-sdk/signer";
import { PostMessageTransport } from "@icp-sdk/signer/web";
import { PageHead } from "@/components/PageHead";
import { II_URL } from "@/services/actor";
import { mobileRedirectUrl, parseMobileAuthRequest } from "@/services/mobileAuth";
import { V2_COLORS, V2_FONTS } from "@/theme";

const UI = {
  page: { minHeight: "100vh", background: V2_COLORS.page, display: "flex", flexDirection: "column" as const, alignItems: "center", justifyContent: "center", padding: "3rem 1.25rem", fontFamily: V2_FONTS.body },
  card: { background: V2_COLORS.paper, border: `1px solid ${V2_COLORS.border}`, maxWidth: 440, width: "100%", padding: "2.5rem 2rem", textAlign: "center" as const, borderRadius: 16 },
  h1:   { fontFamily: V2_FONTS.display, fontSize: "clamp(1.6rem, 5vw, 2rem)", fontWeight: 700, color: V2_COLORS.ink, letterSpacing: "-0.5px", margin: "0 0 0.75rem" },
  body: { fontSize: "1rem", color: V2_COLORS.muted, lineHeight: 1.6, margin: "0 0 1.75rem" },
  cta:  { display: "inline-block", fontFamily: V2_FONTS.body, fontWeight: 600, fontSize: "1rem", color: V2_COLORS.paper, background: V2_COLORS.ink, border: "none", cursor: "pointer", textDecoration: "none", padding: "0.85rem 2rem", borderRadius: 100, minHeight: 48 },
  error: { fontSize: "0.9375rem", color: "#C23F1F", lineHeight: 1.5, margin: "1.25rem 0 0" },
};

type Phase = { kind: "ready" } | { kind: "working" } | { kind: "done"; url: string } | { kind: "error"; message: string };

export default function MobileAuthPage() {
  const request = useMemo(() => parseMobileAuthRequest(window.location.search), []);
  const [phase, setPhase] = useState<Phase>({ kind: "ready" });

  async function signIn() {
    if (!request) return;
    setPhase({ kind: "working" });
    // The Internet Identity window has to open straight from the click.
    const signer = new Signer({ transport: new PostMessageTransport({ url: II_URL }) });
    try {
      await signer.openChannel();
      const chain = await signer.requestDelegation({
        publicKey:     Ed25519PublicKey.fromDer(request.publicKeyDer as DerEncodedPublicKey),
        maxTimeToLive: request.maxTimeToLive,
      });
      const url = mobileRedirectUrl(chain);
      setPhase({ kind: "done", url });
      window.location.href = url;
    } catch (err) {
      console.error("[mobile-auth] sign-in failed:", err);
      setPhase({ kind: "error", message: "Sign-in didn't finish. Try again, or go back to the app and tap Sign in." });
    } finally {
      signer.closeChannel().catch(() => {});
    }
  }

  return (
    <>
      <PageHead><title>Sign in to the app — HomeGentic</title></PageHead>
      <main style={UI.page}>
        <div style={UI.card}>
          {!request ? (
            <>
              <h1 style={UI.h1}>This link doesn't work</h1>
              <p style={{ ...UI.body, margin: 0 }}>Open the HomeGentic app and tap Sign in to start again.</p>
            </>
          ) : phase.kind === "done" ? (
            <>
              <h1 style={UI.h1}>You're signed in</h1>
              <p style={UI.body}>Returning you to the HomeGentic app.</p>
              <a href={phase.url} style={UI.cta}>Open HomeGentic</a>
            </>
          ) : (
            <>
              <h1 style={UI.h1}>Sign in to the HomeGentic app</h1>
              <p style={UI.body}>
                Internet Identity opens in a new window. When you're done you'll go straight back to the app, signed in to the same account you use on the web.
              </p>
              <button type="button" onClick={signIn} disabled={phase.kind === "working"} style={{ ...UI.cta, opacity: phase.kind === "working" ? 0.6 : 1 }}>
                {phase.kind === "working" ? "Waiting for Internet Identity…" : "Continue with Internet Identity"}
              </button>
              {phase.kind === "error" && <p role="alert" style={UI.error}>{phase.message}</p>}
            </>
          )}
        </div>
      </main>
    </>
  );
}
