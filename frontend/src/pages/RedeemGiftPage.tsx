/**
 * /gift/redeem?token=… — the link in a gift recipient's email.
 *
 * The token is the gift's Stripe checkout session id. Redeeming calls
 * payment.redeemGift as the signed-in user, which starts their year of the
 * gifted tier. Signed-out visitors sign in first and are sent back here
 * (AuthContext reads `pendingVerification`).
 */
import React, { useState } from "react";
import { setReturnPath } from "@/utils/returnPath";
import { Link, useSearchParams } from "react-router-dom";
import { Gift, CheckCircle } from "lucide-react";
import { PageHead } from "@/components/PageHead";
import { V2_COLORS, V2_FONTS } from "@/theme";
import { useAuthStore } from "@/store/authStore";
import { useAuth } from "@/contexts/AuthContext";
import { paymentService } from "@/services/payment";

type State = "idle" | "redeeming" | "done" | "error";

export default function RedeemGiftPage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const { isAuthenticated } = useAuthStore();
  const { login, devLogin } = useAuth();
  const [state, setState] = useState<State>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const UI = {
    page: { minHeight: "100vh", background: V2_COLORS.lblue, display: "flex", flexDirection: "column" as const, alignItems: "center", justifyContent: "center", padding: "3rem 1.5rem", fontFamily: V2_FONTS.body },
    card: { background: V2_COLORS.paper, border: `1px solid ${V2_COLORS.border}`, maxWidth: 520, width: "100%", padding: "3rem 2.5rem", textAlign: "center" as const },
    h1:   { fontFamily: V2_FONTS.display, fontSize: "clamp(1.75rem, 4vw, 2.25rem)", fontWeight: 900, color: V2_COLORS.ink, letterSpacing: "-0.5px", margin: "0 0 0.75rem" },
    body: { fontSize: "1rem", color: V2_COLORS.muted, lineHeight: 1.7, margin: "0 0 2rem" },
    cta:  { display: "inline-block", fontFamily: V2_FONTS.body, fontWeight: 600, fontSize: "0.9375rem", color: V2_COLORS.paper, background: V2_COLORS.blue, textDecoration: "none", padding: "0.75rem 2rem", border: "none", cursor: "pointer" },
  };

  const signIn = () => {
    setReturnPath(window.location.pathname + window.location.search);
    (import.meta.env.DEV ? devLogin : login)();
  };

  const redeem = async () => {
    setState("redeeming");
    try {
      await paymentService.redeemGift(token);
      setState("done");
    } catch (e: any) {
      const msg = String(e?.message ?? "");
      setErrorMsg(
        msg === "NotFound" ? "We couldn't find this gift. Check that you opened the full link from your email."
        : /already redeemed/i.test(msg) ? "This gift has already been redeemed."
        : "The gift couldn't be redeemed. Please try again, or contact support.",
      );
      setState("error");
    }
  };

  let content: React.ReactNode;
  if (!token) {
    content = (
      <>
        <h1 style={UI.h1}>Gift link incomplete</h1>
        <p style={UI.body}>This link is missing its gift code. Open the full link from your gift email.</p>
        <Link to="/support" style={UI.cta}>Contact support</Link>
      </>
    );
  } else if (state === "done") {
    content = (
      <>
        <div style={{ marginBottom: "1.5rem" }}><CheckCircle size={40} color={V2_COLORS.blue} /></div>
        <h1 style={UI.h1}>Your gift is active</h1>
        <p style={UI.body}>Your year of HomeGentic Pro starts today. It's a one-time gift, so nothing renews and you won't be charged.</p>
        <Link to="/dashboard" style={UI.cta}>Go to your dashboard</Link>
      </>
    );
  } else {
    content = (
      <>
        <div style={{ marginBottom: "1.5rem" }}><Gift size={40} color={V2_COLORS.blue} /></div>
        <h1 style={UI.h1}>You've been given HomeGentic Pro</h1>
        <p style={UI.body}>
          {isAuthenticated
            ? "Redeem the gift to start your year of Pro on this account."
            : "Sign in or create your account, then redeem the gift to start your year of Pro."}
        </p>
        {state === "error" && (
          <p role="alert" style={{ ...UI.body, color: V2_COLORS.coralText, marginTop: "-1rem" }}>{errorMsg}</p>
        )}
        {isAuthenticated ? (
          <button onClick={redeem} disabled={state === "redeeming"} style={UI.cta}>
            {state === "redeeming" ? "Redeeming…" : "Redeem gift"}
          </button>
        ) : (
          <button onClick={signIn} style={UI.cta}>Sign in to redeem</button>
        )}
      </>
    );
  }

  return (
    <>
      <PageHead><title>Redeem Your Gift — HomeGentic</title></PageHead>
      <div style={UI.page}>
        <div style={UI.card}>{content}</div>
      </div>
    </>
  );
}
